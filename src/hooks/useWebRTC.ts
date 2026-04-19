"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";

export type CallState = "idle" | "ringing" | "calling" | "connected" | "ended";

export function useWebRTC(currentUserId: string | undefined, partnerId: string | undefined) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [incomingCallInfo, setIncomingCallInfo] = useState<{ isVideo: boolean } | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const iceCandidateBufferRef = useRef<RTCIceCandidateInit[]>([]);
  // Mirror of callState accessible inside the channel event listener without re-subscribing
  const callStateRef = useRef<CallState>("idle");

  const setCallStateSync = (s: CallState) => {
    callStateRef.current = s;
    setCallState(s);
  };

  const stopMediaTracks = useCallback((stream: MediaStream | null) => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  }, []);

  const handleHangup = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    iceCandidateBufferRef.current = [];

    setLocalStream((current) => {
      stopMediaTracks(current);
      return null;
    });

    setRemoteStream(null);
    setIncomingCallInfo(null);
    setCallStateSync("ended");
    setTimeout(() => {
      setCallState((s) => (s === "ended" ? "idle" : s));
      callStateRef.current = "idle";
    }, 2000);
  }, [stopMediaTracks]);

  // ── Channel: created ONCE per conversation partner, never recreated on state changes ──
  useEffect(() => {
    if (!currentUserId || !partnerId) return;
    const supabase = createClient();
    const conversationId = [currentUserId, partnerId].sort().join("_");
    const channel = supabase.channel(`webrtc:${conversationId}`, {
      config: { broadcast: { ack: true } },
    });

    const trySetRemoteDescription = async (sdp: RTCSessionDescriptionInit) => {
      if (!peerConnectionRef.current) return;
      try {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        // Flush buffered ICE candidates now that remote description is set
        for (const candidate of iceCandidateBufferRef.current) {
          await peerConnectionRef.current
            .addIceCandidate(new RTCIceCandidate(candidate))
            .catch((err) => console.error("Buffered ICE error", err));
        }
        iceCandidateBufferRef.current = [];
      } catch (e) {
        console.error("Failed to set remote description", e);
      }
    };

    channel.on("broadcast", { event: "webrtc" }, async ({ payload }) => {
      // Ignore our own signals
      if (payload.sender === currentUserId) return;

      // Read state from ref — avoids stale closures without re-subscribing
      const state = callStateRef.current;

      switch (payload.type) {
        case "offer":
          if (state === "idle" || state === "ended") {
            setIncomingCallInfo({ isVideo: payload.isVideo });
            setCallStateSync("ringing");
            peerConnectionRef.current = createPeerConnection(channel);
            await trySetRemoteDescription(payload.offer);
          }
          break;

        case "answer":
          if (peerConnectionRef.current && state === "calling") {
            await trySetRemoteDescription(payload.answer);
            setCallStateSync("connected");
          }
          break;

        case "ice-candidate":
          if (peerConnectionRef.current) {
            if (
              peerConnectionRef.current.remoteDescription &&
              peerConnectionRef.current.remoteDescription.type
            ) {
              try {
                await peerConnectionRef.current.addIceCandidate(
                  new RTCIceCandidate(payload.candidate)
                );
              } catch (e) {
                console.error("Failed adding ICE candidate", e);
              }
            } else {
              iceCandidateBufferRef.current.push(payload.candidate);
            }
          }
          break;

        case "hangup":
          handleHangup();
          break;
      }
    });

    channel.subscribe((status) => {
      console.log("[WebRTC] Channel status:", status);
    });
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
    // ✅ CRITICAL: callState is NOT in this dependency array.
    // Using callStateRef.current instead prevents channel from being torn down on state changes.
  }, [currentUserId, partnerId, handleHangup]); // eslint-disable-line react-hooks/exhaustive-deps

  const createPeerConnection = (channel: RealtimeChannel) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        channel.send({
          type: "broadcast",
          event: "webrtc",
          payload: {
            sender: currentUserId,
            type: "ice-candidate",
            candidate: event.candidate,
          },
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
      setCallStateSync("connected");
    };

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        handleHangup();
      }
    };

    return pc;
  };

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
    } catch (err) {
      console.error("Media access denied:", err);
      alert("Microphone/Camera access was denied. Please allow permissions and try again.");
      return null;
    }
  };

  const startCall = async (isVideo: boolean) => {
    if (!channelRef.current) {
      alert("Not connected to signaling server. Please refresh and try again.");
      return;
    }

    const stream = await getMedia(isVideo);
    if (!stream) return;

    setCallStateSync("calling");

    const pc = createPeerConnection(channelRef.current);
    peerConnectionRef.current = pc;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const resp = await channelRef.current.send({
        type: "broadcast",
        event: "webrtc",
        payload: { sender: currentUserId, type: "offer", offer, isVideo },
      });

      if (resp !== "ok") {
        alert("Call signal was not delivered. Is the other user online?");
        handleHangup();
      }
    } catch (err) {
      console.error("Error creating offer:", err);
      handleHangup();
    }
  };

  const acceptCall = async () => {
    if (!incomingCallInfo || !peerConnectionRef.current || !channelRef.current) return;

    const stream = await getMedia(incomingCallInfo.isVideo);
    if (!stream) {
      declineCall();
      return;
    }

    stream.getTracks().forEach((track) => peerConnectionRef.current!.addTrack(track, stream));

    try {
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);

      const resp = await channelRef.current.send({
        type: "broadcast",
        event: "webrtc",
        payload: { sender: currentUserId, type: "answer", answer },
      });

      if (resp !== "ok") {
        alert("Failed to connect: Answer signal dropped.");
        handleHangup();
      } else {
        setCallStateSync("connected");
      }
    } catch (err) {
      console.error("Error creating answer:", err);
      handleHangup();
    }
  };

  const declineCall = () => {
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "webrtc",
        payload: { sender: currentUserId, type: "hangup" },
      });
    }
    handleHangup();
  };

  const endCall = () => {
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "webrtc",
        payload: { sender: currentUserId, type: "hangup" },
      });
    }
    handleHangup();
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  return {
    callState,
    localStream,
    remoteStream,
    incomingCallInfo,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    isVideoEnabled,
    isAudioEnabled,
    toggleVideo,
    toggleAudio,
  };
}
