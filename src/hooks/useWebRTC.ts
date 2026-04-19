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
    })
    
    setRemoteStream(null);
    setIncomingCallInfo(null);
    setCallState("ended");
    setTimeout(() => {
        setCallState((s) => s === "ended" ? "idle" : s);
    }, 2000);
  }, [stopMediaTracks]);

  // Handle incoming signaling messages
  useEffect(() => {
    if (!currentUserId || !partnerId) return;
    const supabase = createClient();
    const conversationId = [currentUserId, partnerId].sort().join("_");
    const channel = supabase.channel(`webrtc:${conversationId}`, {
      config: { broadcast: { ack: true } }
    });
    
    const trySetRemoteDescription = async (sdp: RTCSessionDescriptionInit) => {
        if (!peerConnectionRef.current) return;
        try {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
            // Flush buffered ICE candidates
            for (const candidate of iceCandidateBufferRef.current) {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => console.error("Buffered ICE error", err));
            }
            iceCandidateBufferRef.current = [];
        } catch (e) {
            console.error("Failed to set remote description", e);
        }
    }

    channel.on("broadcast", { event: "webrtc" }, async ({ payload }) => {
      if (payload.sender === currentUserId) return;

      switch (payload.type) {
        case "offer":
          if (callState === "idle" || callState === "ended") {
             setIncomingCallInfo({ isVideo: payload.isVideo });
             setCallState("ringing");
             peerConnectionRef.current = createPeerConnection(channel);
             await trySetRemoteDescription(payload.offer);
          }
          break;

        case "answer":
          if (peerConnectionRef.current && callState === "calling") {
            await trySetRemoteDescription(payload.answer);
            setCallState("connected");
          }
          break;

        case "ice-candidate":
          if (peerConnectionRef.current) {
            if (peerConnectionRef.current.remoteDescription && peerConnectionRef.current.remoteDescription.type) {
              try {
                 await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
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

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, [currentUserId, partnerId, callState, handleHangup]);

  const createPeerConnection = (channel: RealtimeChannel) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        channel.send({
          type: "broadcast",
          event: "webrtc",
          payload: { sender: currentUserId, type: "ice-candidate", candidate: event.candidate },
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
      setCallState("connected"); // fallback state set
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
         handleHangup();
      }
    }

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
      alert("Microphone/Camera access was denied.");
      return null;
    }
  };

  const startCall = async (isVideo: boolean) => {
    const stream = await getMedia(isVideo);
    if (!stream) return;
    
    setCallState("calling");
    
    if (!channelRef.current) return;
    const pc = createPeerConnection(channelRef.current);
    peerConnectionRef.current = pc;

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
    
        channelRef.current.send({
          type: "broadcast",
          event: "webrtc",
          payload: { sender: currentUserId, type: "offer", offer, isVideo },
        });
    } catch (err) {
        console.error("Error creating offer", err);
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
    
        channelRef.current.send({
          type: "broadcast",
          event: "webrtc",
          payload: { sender: currentUserId, type: "answer", answer },
        });
        setCallState("connected");
    } catch(err) {
        console.error("Error creating answer", err);
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
  }

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
