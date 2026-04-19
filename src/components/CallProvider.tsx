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
  isAccepting: boolean;
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

// Free TURN relay ensures media flows even between different networks / mobile NAT
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    // Free open relay TURN — handles strict NAT / mobile data networks
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
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
  const [isAccepting, setIsAccepting] = useState(false); // loading state for Accept btn

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

  // Clean up processed signals for this user
  const cleanupMySignals = useCallback(async () => {
    const supabase = createClient();
    await supabase.from("call_signals").delete().eq("to_user_id", currentUserId);
  }, [currentUserId]);

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
    setIsAccepting(false);
    partnerIdRef.current = null;
    syncState("ended");
    setTimeout(() => {
      if (callStateRef.current === "ended") syncState("idle");
    }, 2000);
    // Cleanup any lingering signals in DB
    cleanupMySignals().catch(console.error);
  }, [stopTracks, cleanupMySignals]);

  const flushIceBuf = async (pc: RTCPeerConnection) => {
    for (const c of iceBufRef.current) {
      await pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.error);
    }
    iceBufRef.current = [];
  };

  const createPc = useCallback((partnerId: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal(partnerId, "ice-candidate", { candidate: e.candidate.toJSON() });
      }
    };

    pc.ontrack = (e) => {
      console.log("[Call] Remote track received:", e.track.kind);
      if (e.streams[0]) {
        setRemoteStream(e.streams[0]);
      }
      syncState("connected");
    };

    pc.onconnectionstatechange = () => {
      console.log("[Call] PeerConnection state:", pc.connectionState);
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        handleHangup();
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log("[Call] ICE gathering state:", pc.iceGatheringState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[Call] ICE connection state:", pc.iceConnectionState);
    };

    return pc;
  }, [handleHangup, sendSignal]);

  // ── Global DB subscription — fires on ANY new call_signals row addressed to me ──
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
        async (payload: { new: { id: number; from_user_id: string; type: string; data: Record<string, unknown> } }) => {
          const { from_user_id: senderId, type, data } = payload.new;
          const state = callStateRef.current;
          console.log("[Call] Signal received:", type, "from:", senderId, "| state:", state);

          switch (type) {
            case "offer": {
              if (state !== "idle" && state !== "ended") {
                console.log("[Call] Ignoring offer — already in a call");
                break;
              }

              const { data: profile } = await supabase
                .from("users")
                .select("username, avatar_url")
                .eq("id", senderId)
                .single();

              const callerName = profile?.username ?? "Unknown";
              const callerAvatar = profile?.avatar_url ?? "";

              setIncomingCallInfo({ isVideo: !!data.isVideo, callerId: senderId, callerName, callerAvatar });
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
              if (!pcRef.current || state !== "calling") {
                console.log("[Call] Ignoring answer — wrong state:", state);
                break;
              }
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
        console.log("[Call] DB subscription:", status);
      });

    // Clean up old stale signals from previous sessions
    cleanupMySignals().catch(console.error);

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, createPc, handleHangup, cleanupMySignals]);

  // ── getUserMedia with proper error messaging ──
  const getMedia = async (isVideo: boolean): Promise<MediaStream | null> => {
    // Try with requested video first, fallback to audio-only if video fails
    const constraints = [
      { video: isVideo ? { facingMode: "user" } : false, audio: { echoCancellation: true, noiseSuppression: true } },
      { video: false, audio: { echoCancellation: true, noiseSuppression: true } }, // audio-only fallback
    ];

    for (const constraint of constraints) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraint);
        const hasVideo = stream.getVideoTracks().length > 0;
        setLocalStream(stream);
        setIsVideoEnabled(hasVideo);
        setIsAudioEnabled(true);
        console.log("[Call] Media obtained — video:", hasVideo, "audio:", stream.getAudioTracks().length > 0);
        return stream;
      } catch (err) {
        const error = err as DOMException;
        console.warn("[Call] getUserMedia failed with constraint:", constraint, error.name);
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          alert("⚠️ Microphone/Camera permission was denied.\n\nPlease allow access in your browser settings and try again.");
          return null;
        }
        // Try next constraint (video → audio-only fallback)
        if (constraint.video === false) {
          alert("⚠️ Could not access microphone. Please check your device permissions.");
          return null;
        }
        continue;
      }
    }
    return null;
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
    await sendSignal(partnerId, "offer", { offer, isVideo });
    console.log("[Call] Offer sent to:", partnerId);
  };

  const acceptCall = async () => {
    if (!incomingCallInfo || !pcRef.current) return;
    setIsAccepting(true); // Show loading on Accept button

    const stream = await getMedia(incomingCallInfo.isVideo);
    if (!stream) {
      // DON'T decline — just stop the loading state so user can try again
      setIsAccepting(false);
      return;
    }

    stream.getTracks().forEach((t) => pcRef.current!.addTrack(t, stream));
    const answer = await pcRef.current.createAnswer();
    await pcRef.current.setLocalDescription(answer);
    await sendSignal(incomingCallInfo.callerId, "answer", { answer });
    syncState("connected");
    setIsAccepting(false);
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
    <CallContext.Provider value={{
      callState, callPartnerId, callPartnerName, callPartnerAvatar,
      localStream, remoteStream, incomingCallInfo,
      isVideoEnabled, isAudioEnabled, isAccepting,
      startCall, acceptCall, declineCall, endCall, toggleVideo, toggleAudio,
    }}>
      {children}
    </CallContext.Provider>
  );
}
