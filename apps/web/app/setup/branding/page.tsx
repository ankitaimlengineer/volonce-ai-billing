"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  authBlobUrl,
  authDelete,
  authGet,
  authUpload,
  clearTokens,
} from "@/lib/api";
import SignaturePad from "./SignaturePad";

type Kind = "logo" | "signature";
type Branding = { has_logo: boolean; has_signature: boolean };

// Fetches the current image URL (does not touch React state)
async function loadImage(kind: Kind): Promise<string | null> {
  const status = await authGet<Branding>("/api/v1/business/branding");
  const has = kind === "logo" ? status.has_logo : status.has_signature;
  return has ? await authBlobUrl(`/api/v1/business/${kind}`) : null;
}

function ImageUploader({
  kind,
  title,
  hint,
  allowDraw = false,
  onAuthError,
}: {
  kind: Kind;
  title: string;
  hint: string;
  allowDraw?: boolean;
  onAuthError: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drawing, setDrawing] = useState(false);

  // Initial load. The async work + cancel guard avoids setState-in-effect issues.
  useEffect(() => {
    let cancelled = false;
    loadImage(kind)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          onAuthError();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kind, onAuthError]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      await authUpload(`/api/v1/business/${kind}`, file);
      setUrl(await loadImage(kind));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthError();
        return;
      }
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      await authDelete(`/api/v1/business/${kind}`);
      setUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDrawnFile(file: File) {
    setError("");
    try {
      await authUpload(`/api/v1/business/${kind}`, file);
      setUrl(await loadImage(kind));
      setDrawing(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthError();
        return;
      }
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-gray-200 p-4">
      <h2 className="font-semibold text-gray-800">{title}</h2>
      <p className="text-sm text-gray-500">{hint}</p>

      <div className="mt-3 flex h-28 items-center justify-center rounded-lg bg-gray-50">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={title} className="max-h-24 max-w-full object-contain" />
        ) : (
          <span className="text-sm text-gray-400">Haju upload nathi thayu</span>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {drawing && (
        <SignaturePad onSave={handleDrawnFile} onCancel={() => setDrawing(false)} />
      )}

      <div className="mt-3 flex gap-3">
        <label className="cursor-pointer rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
          {busy ? "Please wait..." : url ? "Change" : "Upload"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={busy}
            onChange={handleFile}
          />
        </label>
        {url && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Remove
          </button>
        )}
        {allowDraw && !drawing && (
          <button
            type="button"
            onClick={() => setDrawing(true)}
            disabled={busy}
            className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
          >
            Draw
          </button>
        )}
      </div>
    </div>
  );
}

export default function BrandingPage() {
  const router = useRouter();

  const onAuthError = useCallback(() => {
    clearTokens();
    router.replace("/login");
  }, [router]);

  return (
    <main className="min-h-screen bg-emerald-50 p-6">
      <div className="mx-auto w-full max-w-xl rounded-2xl bg-white p-8 shadow">
        <p className="text-sm font-medium text-emerald-700">Step 2 of 3</p>
        <h1 className="text-2xl font-bold text-emerald-800">Logo ane Signature</h1>
        <p className="mt-1 text-sm text-gray-600">
          Aa ek j vaar upload karo. Darek invoice ma automatic aavshe. (Optional, pachi pan
          badli shakay.)
        </p>

        <ImageUploader
          kind="logo"
          title="Business Logo"
          hint="PNG, JPG ke WebP, max 2 MB"
          onAuthError={onAuthError}
        />
        <ImageUploader
          kind="signature"
          title="Authorized Signature"
          hint="Upload karo athva screen par draw karo."
          allowDraw
          onAuthError={onAuthError}
        />

        <div className="mt-8 flex items-center justify-between">
          <Link href="/setup" className="text-sm text-gray-600 hover:underline">
            ← Back
          </Link>
          <Link
            href="/setup/invoice"
            className="rounded-lg bg-emerald-700 px-6 py-2.5 font-medium text-white hover:bg-emerald-800"
          >
            Next →
          </Link>
        </div>
      </div>
    </main>
  );
}