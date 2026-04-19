"use client";

import { useEffect, useRef } from "react";
import type { CallState } from "@/components/CallProvider";

interface CallInterfaceProps {
  callState: CallState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  incomingCallInfo: { isVideo: boolean } | null;
  partnerName: string;
  partnerAvatar?: string;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onEndCall: () => void;
  onToggleVideo: () => void;
  onToggleAudio: () => void;
  isAccepting?: boolean;
}

export default function CallInterface({
  callState,
  localStream,
  remoteStream,
  incomingCallInfo,
  partnerName,
  partnerAvatar,
  isVideoEnabled,
  isAudioEnabled,
  onAccept,
  onDecline,
  onEndCall,
  onToggleVideo,
  onToggleAudio,
  isAccepting = false,
}: CallInterfaceProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(err => console.error("Local play blocked:", err));
    }
  }, [localStream, callState]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(err => console.error("Remote play blocked:", err));
    }
  }, [remoteStream, callState]);

  if (callState === "idle" || callState === "ended") return null;

  if (callState === "ringing") {
    return (
      <div className="call-overlay">
        <div className="call-modal">
          <div className="call-avatar">
            {partnerAvatar ? (
               <img src={partnerAvatar} alt="Partner" />
            ) : (
               <div className="call-avatar-placeholder">
                 {partnerName ? partnerName.slice(0,2).toUpperCase() : "?"}
               </div>
            )}
          </div>
          <h2 className="call-title">Incoming {incomingCallInfo?.isVideo ? "Video" : "Audio"} Call</h2>
          <p className="call-subtitle">from {partnerName}</p>
          <div className="call-actions">
            <button className="btn btn--danger" onClick={onDecline} disabled={isAccepting}>Decline</button>
            <button className="btn btn--primary" onClick={onAccept} disabled={isAccepting}>
              {isAccepting ? "Connecting..." : "Accept"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (callState === "calling") {
     return (
        <div className="call-overlay">
          <div className="call-modal">
             <div className="call-avatar call-avatar--pulsing">
              {partnerAvatar ? (
                 <img src={partnerAvatar} alt="Partner" />
              ) : (
                 <div className="call-avatar-placeholder">
                   {partnerName ? partnerName.slice(0,2).toUpperCase() : "?"}
                 </div>
              )}
             </div>
             <h2 className="call-title">Calling {partnerName}...</h2>
             <div className="call-actions">
               <button className="btn btn--danger" onClick={onEndCall}>Cancel</button>
             </div>
          </div>
        </div>
     );
  }

  // Connected state
  const hasRemoteVideo = remoteStream && remoteStream.getVideoTracks().length > 0;
  
  return (
    <div className={`call-overlay ${!hasRemoteVideo ? "call-overlay--audio-focused" : ""}`}>
      {/* Remote Video (Full Screen) */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className={`call-video-remote ${!hasRemoteVideo ? "hidden" : ""}`}
      />
      
      {/* Fallback avatar for audio-only calls */}
      {!hasRemoteVideo && (
         <div className="call-audio-avatar">
            {partnerAvatar ? (
               <img src={partnerAvatar} alt="Partner" />
            ) : (
               <div className="call-avatar-placeholder">
                 {partnerName ? partnerName.slice(0,2).toUpperCase() : "?"}
               </div>
            )}
            <p>{partnerName}</p>
         </div>
      )}

      {/* Local Video (PiP) */}
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className="call-video-local"
        style={{ display: isVideoEnabled && localStream && localStream.getVideoTracks().length > 0 ? "block" : "none" }}
      />
      
      {/* Controls */}
      <div className="call-controls">
        <button onClick={onToggleAudio} className={`call-btn ${!isAudioEnabled ? "call-btn--off" : ""}`}>
           {isAudioEnabled ? "🎤" : "🔇"}
        </button>
        <button onClick={onToggleVideo} className={`call-btn ${!isVideoEnabled ? "call-btn--off" : ""}`}>
           {isVideoEnabled ? "📹" : "🚫"}
        </button>
        <button onClick={onEndCall} className="call-btn call-btn--danger">
           End Call
        </button>
      </div>
    </div>
  );
}
