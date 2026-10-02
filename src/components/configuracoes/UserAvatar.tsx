import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const AVATAR_BUCKET = "produto_imagens";
export const avatarPath = (userId: string) => `avatars/${userId}.jpg`;

/** URL pública da foto; `version` força recarregar após trocar a foto. */
export const avatarUrl = (userId: string, version?: number) => {
  const base = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(avatarPath(userId)).data.publicUrl;
  return `${base}?v=${version ?? new Date().toISOString().slice(0, 10)}`;
};

export interface UserAvatarProps {
  userId: string;
  nome: string;
  version?: number;
  className?: string;
}

/** Foto de perfil com fallback para a inicial do nome. */
export const UserAvatar = ({ userId, nome, version, className }: UserAvatarProps) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = avatarUrl(userId, version);
  const showImg = failedSrc !== src;

  return (
    <div
      className={cn(
        "w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary overflow-hidden shrink-0",
        className,
      )}
    >
      {showImg ? (
        <img
          src={src}
          alt={`Foto de ${nome}`}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        nome.charAt(0).toUpperCase()
      )}
    </div>
  );
};

/** Redimensiona para 256px (JPEG) antes de enviar — fotos de celular são grandes. */
export const resizeImage = (file: File, size = 256): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas indisponível"));
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao converter imagem"))), "image/jpeg", 0.85);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => reject(new Error("Imagem inválida"));
    img.src = url;
  });

export const uploadAvatar = async (userId: string, file: File) => {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem");
  const blob = await resizeImage(file);
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(avatarPath(userId), blob, { upsert: true, contentType: "image/jpeg", cacheControl: "60" });
  if (error) throw error;
};
