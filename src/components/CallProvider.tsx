"use client";

import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";

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

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export function CallProvider({
  currentUserId,
  children,
}: {
  currentUserId: string;
  children: ReactNode;
}) {
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
  const iceBufRef = useRef<RTCIceCandidateInit[]>([]);
  const callStateRef = useRef<CallState>("idle");
  const partnerIdRef = useRef<string | null>(null);

  const syncState = (s: CallState) => {
    callStateRef.current = s;
    setCallState(s);
  };

  const stopTracks = useCallback((s: MediaStream | null) => {
    s?.getTracks().forEach((t) => t.stop());
  }, []);

  // ── Insert a signal row into call_signals table ──
  const sendSignal = useCallback(
    async (toUserId: string, type: string, data: object = {}) => {
      const supabase = createClient();
      const { error } = await supabase.from("call_signals").insert({
        from_user_id: currentUserId,
        to_user_id: toUserId,
        type,
        data,
      });
      if (error) console.error("[Call] sendSignal error:", type, error.message);
    },
    [currentUserId]
  );

  const handleHangup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    iceBufRef.current = [];

    setLocalStream((cur) => {
      stopTracks(cur);
      return null;
    });
    setRemoteStream(null);
    setIncomingCallInfo(null);
    setCallPartnerId(null);
    setCallPartnerName("");
    setCallPartnerAvatar("");
    partnerIdRef.current = null;
    syncState("ended");

    setTimeout(() => {
      if (callStateRef.current === "ended") syncState("idle");
    }, 2000);
  }, [stopTracks]);

  const flushIceBuf = async (pc: RTCPeerConnection) => {
    for (const c of iceBufRef.current) {
      await pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.error);
    }
    iceBufRef.current = [];
  };

  const createPc = useCallback(
    (partnerId: string) => {
      const pc = new RTCPeerConnection(ICE_SERVERS);

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal(partnerId, "ice-candidate", { candidate: e.candidate.toJSON() });
        }
      };

      pc.ontrack = (e) => {
        setRemoteStream(e.streams[0]);
        syncState("connected");
      };

      pc.onconnectionstatechange = () => {
        if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
          handleHangup();
        }
      };

      return pc;
    },
    [handleHangup, sendSignal]
  );

  // ── Global DB subscription — triggers on any INSERT to call_signals addressed to me ──
  useEffect(() => {
    if (!currentUserId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`call-signals-${currentUserId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "call_signals",
          filter: `to_user_id=eq.${currentUserId}`,
        },
        async (payload: { new: { from_user_id: string; type: string; data: Record<string, unknown> } }) => {
          const { from_user_id: senderId, type, data } = payload.new;
          const state = callStateRef.current;
          console.log("[Call] Received signal:", type, "from:", senderId, "state:", state);

          switch (type) {
            case "offer": {
              if (state !== "idle" && state !== "ended") break;

              // Fetch caller profile
              const { data: profile } = await supabase
                .from("users")
                .select("username, avatar_url")
                .eq("id", senderId)
                .single();

              const callerName = profile?.username ?? "Unknown";
              const callerAvatar = profile?.avatar_url ?? "";

              setIncomingCallInfo({ isVideo: data.isVideo as boolean, callerId: senderId, callerName, callerAvatar });
              setCallPartnerId(senderId);
              setCallPartnerName(callerName);
              setCallPartnerAvatar(callerAvatar);
              partnerIdRef.current = senderId;
              syncState("ringing");

              const pc = createPc(senderId);
              pcRef.current = pc;
              await pc.setRemoteDescription(new RTCSessionDescription(data.offer as RTCSessionDescriptionInit));
              await flushIceBuf(pc);
              break;
            }

            case "answer": {
              if (!pcRef.current || state !== "calling") break;
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer as RTCSessionDescriptionInit));
              await flushIceBuf(pcRef.current);
              syncState("connected");
              break;
            }

            case "ice-candidate": {
              if (!pcRef.current) break;
              const candidate = data.candidate as RTCIceCandidateInit;
              if (pcRef.current.remoteDescription?.type) {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
              } else {
                iceBufRef.current.push(candidate);
              }
              break;
            }

            case "hangup":
              handleHangup();
              break;
          }
        }
      )
      .subscribe((status) => {
        console.log("[Call] DB channel status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, createPc, handleHangup]);

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
      alert("Camera/Microphone access denied. Please allow permissions in your browser settings and reload.");
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

    const pc = createPc(partnerId);
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // This DB insert triggers Postgres Changes on the receiver's device
    await sendSignal(partnerId, "offer", { offer, isVideo });
    console.log("[Call] Offer sent via DB to:", partnerId);
  };

  const acceptCall = async () => {
    if (!incomingCallInfo || !pcRef.current) return;
    const stream = await getMedia(incomingCallInfo.isVideo);
    if (!stream) { declineCall(); return; }

    stream.getTracks().forEach((t) => pcRef.current!.addTrack(t, stream));
    const answer = await pcRef.current.createAnswer();
    await pcRef.current.setLocalDescription(answer);

    await sendSignal(incomingCallInfo.callerId, "answer", { answer });
    syncState("connected");
  };

  const declineCall = () => {
    if (incomingCallInfo) {
      sendSignal(incomingCallInfo.callerId, "hangup").catch(console.error);
    }
    handleHangup();
  };

  const endCall = () => {
    const pid = partnerIdRef.current;
    if (pid) sendSignal(pid, "hangup").catch(console.error);
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
