"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";

export type CallState = "idle" | "ringing" | "calling" | "connected" | "ended";

interface IncomingCallInfo {
  isVideo: boolean;
  callerId: string;
  callerName: string;
  callerAvatar: string;
}

interface CallContextValue {
  callState: CallState;
  callPartnerId: string | null;
  callPartnerName: string;
  callPartnerAvatar: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  incomingCallInfo: IncomingCallInfo | null;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  startCall: (partnerId: string, partnerName: string, partnerAvatar: string, isVideo: boolean) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  endCall: () => void;
  toggleVideo: () => void;
  toggleAudio: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCallContext() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCallContext must be inside CallProvider");
  return ctx;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
  ],
};

export function CallProvider({ currentUserId, children }: { currentUserId: string; children: ReactNode }) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [callPartnerId, setCallPartnerId] = useState<string | null>(null);
  const [callPartnerName, setCallPartnerName] = useState("");
  const [callPartnerAvatar, setCallPartnerAvatar] = useState("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [incomingCallInfo, setIncomingCallInfo] = useState<IncomingCallInfo | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const myChannelRef = useRef<RealtimeChannel | null>(null);
  const partnerChannelRef = useRef<RealtimeChannel | null>(null);
  const iceBufRef = useRef<RTCIceCandidateInit[]>([]);
  const callStateRef = useRef<CallState>("idle");
  const partnerIdRef = useRef<string | null>(null);

  /* ── helpers ── */
  const syncState = (s: CallState) => {
    callStateRef.current = s;
    setCallState(s);
  };

  const stopTracks = useCallback((s: MediaStream | null) => {
    s?.getTracks().forEach((t) => t.stop());
  }, []);

  const sendToPartner = useCallback(
    async (partnerId: string, payload: object) => {
      const supabase = createClient();

      // If we already have a channel for this partner, use it
      if (!partnerChannelRef.current) {
        const ch = supabase.channel(`user-signal:${partnerId}`, {
          config: { broadcast: { ack: true } },
        });
        await new Promise<void>((res) => {
          ch.subscribe((status) => { if (status === "SUBSCRIBED") res(); });
        });
        partnerChannelRef.current = ch;
      }

      return partnerChannelRef.current.send({
        type: "broadcast",
        event: "call-signal",
        payload,
      });
    },
    []
  );

  const cleanupPartnerChannel = useCallback(() => {
    if (partnerChannelRef.current) {
      const supabase = createClient();
      supabase.removeChannel(partnerChannelRef.current);
      partnerChannelRef.current = null;
    }
  }, []);

  const handleHangup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    iceBufRef.current = [];

    setLocalStream((cur) => { stopTracks(cur); return null; });
    setRemoteStream(null);
    setIncomingCallInfo(null);
    setCallPartnerId(null);
    setCallPartnerName("");
    setCallPartnerAvatar("");
    partnerIdRef.current = null;
    cleanupPartnerChannel();
    syncState("ended");

    setTimeout(() => {
      if (callStateRef.current === "ended") syncState("idle");
    }, 2000);
  }, [stopTracks, cleanupPartnerChannel]);

  const flushIceBuf = async (pc: RTCPeerConnection) => {
    for (const c of iceBufRef.current) {
      await pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.error);
    }
    iceBufRef.current = [];
  };

  const createPc = useCallback((onIce: (c: RTCIceCandidateInit) => void) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pc.onicecandidate = (e) => { if (e.candidate) onIce(e.candidate.toJSON()); };
    pc.ontrack = (e) => { setRemoteStream(e.streams[0]); syncState("connected"); };
    pc.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) handleHangup();
    };
    return pc;
  }, [handleHangup]);

  /* ── Personal incoming-signal channel (always live) ── */
  useEffect(() => {
    if (!currentUserId) return;
    const supabase = createClient();
    const ch = supabase.channel(`user-signal:${currentUserId}`, {
      config: { broadcast: { ack: true } },
    });

    ch.on("broadcast", { event: "call-signal" }, async ({ payload }) => {
      if (payload.sender === currentUserId) return;
      const state = callStateRef.current;

      switch (payload.type) {
        case "offer": {
          if (state !== "idle" && state !== "ended") break;
          // Fetch caller profile
          const supa = createClient();
          const { data } = await supa.from("users").select("username, avatar_url").eq("id", payload.sender).single();
          setIncomingCallInfo({
            isVideo: payload.isVideo,
            callerId: payload.sender,
            callerName: data?.username ?? "Unknown",
            callerAvatar: data?.avatar_url ?? "",
          });
          setCallPartnerId(payload.sender);
          setCallPartnerName(data?.username ?? "");
          setCallPartnerAvatar(data?.avatar_url ?? "");
          partnerIdRef.current = payload.sender;
          syncState("ringing");

          const pc = createPc(async (candidate) => {
            await sendToPartner(payload.sender, { sender: currentUserId, type: "ice-candidate", candidate });
          });
          pcRef.current = pc;
          await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
          await flushIceBuf(pc);
          break;
        }

        case "answer": {
          if (!pcRef.current || state !== "calling") break;
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
          await flushIceBuf(pcRef.current);
          syncState("connected");
          break;
        }

        case "ice-candidate": {
          if (!pcRef.current) break;
          if (pcRef.current.remoteDescription?.type) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(console.error);
          } else {
            iceBufRef.current.push(payload.candidate);
          }
          break;
        }

        case "hangup":
          handleHangup();
          break;
      }
    });

    ch.subscribe((status) => console.log("[Call] My channel status:", status));
    myChannelRef.current = ch;

    return () => {
      supabase.removeChannel(ch);
      myChannelRef.current = null;
    };
  }, [currentUserId, createPc, handleHangup, sendToPartner]);

  /* ── Public actions ── */
  const getMedia = async (isVideo: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isVideo ? { facingMode: "user" } : false,
        audio: true,
      });
      setLocalStream(stream);
      setIsVideoEnabled(isVideo);
      setIsAudioEnabled(true);
      return stream;
    } catch {
      alert("Camera/Microphone access denied. Please allow permissions and try again.");
      return null;
    }
  };

  const startCall = async (partnerId: string, partnerName: string, partnerAvatar: string, isVideo: boolean) => {
    const stream = await getMedia(isVideo);
    if (!stream) return;

    setCallPartnerId(partnerId);
    setCallPartnerName(partnerName);
    setCallPartnerAvatar(partnerAvatar);
    partnerIdRef.current = partnerId;
    syncState("calling");

    // Subscribe to partner's channel to send them the signal
    cleanupPartnerChannel();

    const pc = createPc(async (candidate) => {
      await sendToPartner(partnerId, { sender: currentUserId, type: "ice-candidate", candidate });
    });
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const resp = await sendToPartner(partnerId, {
      sender: currentUserId,
      type: "offer",
      offer,
      isVideo,
    });

    if (resp !== "ok") {
      alert("Call failed — could not reach the other user. Make sure they have the app open.");
      handleHangup();
    }
  };

  const acceptCall = async () => {
    if (!incomingCallInfo || !pcRef.current) return;
    const stream = await getMedia(incomingCallInfo.isVideo);
    if (!stream) { declineCall(); return; }

    stream.getTracks().forEach((t) => pcRef.current!.addTrack(t, stream));
    const answer = await pcRef.current.createAnswer();
    await pcRef.current.setLocalDescription(answer);

    const resp = await sendToPartner(incomingCallInfo.callerId, {
      sender: currentUserId,
      type: "answer",
      answer,
    });

    if (resp !== "ok") {
      alert("Failed to connect — answer signal dropped.");
      handleHangup();
    } else {
      syncState("connected");
    }
  };

  const declineCall = () => {
    if (incomingCallInfo) {
      sendToPartner(incomingCallInfo.callerId, { sender: currentUserId, type: "hangup" }).catch(console.error);
    }
    handleHangup();
  };

  const endCall = () => {
    const pid = partnerIdRef.current;
    if (pid) {
      sendToPartner(pid, { sender: currentUserId, type: "hangup" }).catch(console.error);
    }
    handleHangup();
  };

  const toggleVideo = () => {
    if (localStream) {
      const t = localStream.getVideoTracks()[0];
      if (t) { t.enabled = !t.enabled; setIsVideoEnabled(t.enabled); }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const t = localStream.getAudioTracks()[0];
      if (t) { t.enabled = !t.enabled; setIsAudioEnabled(t.enabled); }
    }
  };

  return (
    <CallContext.Provider
      value={{
        callState, callPartnerId, callPartnerName, callPartnerAvatar,
        localStream, remoteStream, incomingCallInfo,
        isVideoEnabled, isAudioEnabled,
        startCall, acceptCall, declineCall, endCall, toggleVideo, toggleAudio,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}
