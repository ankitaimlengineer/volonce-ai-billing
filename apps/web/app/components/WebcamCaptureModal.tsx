"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface WebcamCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageBlob: Blob, dataUrl: string) => void;
}

export default function WebcamCaptureModal({
  isOpen,
  onClose,
  onCapture,
}: WebcamCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Stop Camera Streams
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Start Camera
  const startCamera = useCallback(async () => {
    setLoading(true);
    setCameraError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          facingMode: "environment",
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: unknown) {
      console.error("Camera access error:", err);
      const errorObj = err as { name?: string; message?: string };
      if (
        errorObj.name === "NotAllowedError" ||
        errorObj.name === "PermissionDeniedError"
      ) {
        setCameraError(
          "કેમેરા પરવાનગી (Permission) નકારી દેવામાં આવી છે. બ્રાઉઝર સેટિંગ્સમાંથી મંજૂરી આપો."
        );
      } else if (
        errorObj.name === "NotFoundError" ||
        errorObj.name === "DevicesNotFoundError"
      ) {
        setCameraError("લેપટોપ/સિસ્ટમમાં કોઈ કેમેરા મળ્યો નથી.");
      } else {
        setCameraError(
          "કેમેરા ચાલુ કરવામાં સમસ્યા આવી: " + (errorObj.message || "અજ્ઞાત ભૂલ")
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    if (isOpen) {
      // Async trigger avoids synchronous setState warning in React 19
      const timer = setTimeout(() => {
        if (active) {
          startCamera();
        }
      }, 0);
      return () => {
        active = false;
        clearTimeout(timer);
        stopCamera();
      };
    } else {
      stopCamera();
    }

    return () => {
      active = false;
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  // Capture Photo Snapshot
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      setCapturedImage(dataUrl);

      canvas.toBlob(
        (blob) => {
          if (blob) setCapturedBlob(blob);
        },
        "image/jpeg",
        0.92
      );
    }
  };

  // Retake photo
  const handleRetake = () => {
    setCapturedImage(null);
    setCapturedBlob(null);
  };

  // Confirm and Send to Parent
  const handleConfirm = () => {
    if (capturedBlob && capturedImage) {
      onCapture(capturedBlob, capturedImage);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              📷 લેપટોપ કેમેરા સ્કેનર (Webcam)
            </h3>
            <p className="text-xs text-gray-500">
              સામે પ્રોડક્ટ અથવા બિલ રાખીને ફોટો ક્લિક કરો
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            ✕
          </button>
        </div>

        {/* Video / Preview Area */}
        <div className="relative aspect-video w-full bg-slate-900 flex items-center justify-center overflow-hidden">
          {loading && (
            <div className="text-white text-sm animate-pulse">
              કેમેરા શરૂ થઈ રહ્યો છે...
            </div>
          )}

          {cameraError && (
            <div className="p-6 text-center text-red-400">
              <p className="font-semibold">{cameraError}</p>
              <button
                onClick={startCamera}
                className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-500"
              >
                ફરી પ્રયાસ કરો
              </button>
            </div>
          )}

          {/* Live Video */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-cover ${
              capturedImage || cameraError ? "hidden" : "block"
            }`}
          />

          {/* Captured Preview */}
          {capturedImage && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={capturedImage}
              alt="Captured item"
              className="h-full w-full object-contain bg-black"
            />
          )}

          {/* Hidden Canvas for capture processing */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Target Box Guide Overlay */}
          {!capturedImage && !cameraError && !loading && (
            <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-dashed border-emerald-400/60 flex items-center justify-center">
              <span className="bg-black/50 px-3 py-1 rounded text-xs text-white">
                આ બોક્સમાં વસ્તુ અથવા બિલ રાખો
              </span>
            </div>
          )}
        </div>

        {/* Controls Footer */}
        <div className="flex items-center justify-between bg-gray-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
          >
            રદ કરો (Cancel)
          </button>

          <div className="flex gap-3">
            {capturedImage ? (
              <>
                <button
                  type="button"
                  onClick={handleRetake}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition"
                >
                  🔄 ફરીથી લો (Retake)
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500 transition"
                >
                  ✓ ફોટો વાપરો (Use Photo)
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={capturePhoto}
                disabled={loading || !!cameraError}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-emerald-500 disabled:opacity-50 transition"
              >
                📸 ફોટો પાડો (Capture)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}