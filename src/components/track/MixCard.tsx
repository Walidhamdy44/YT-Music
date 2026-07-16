"use client";

interface MixCardProps {
  title: string;
  description: string;
  thumbnail?: string;
  onClick?: () => void;
}

export function MixCard({ title, description, thumbnail, onClick }: MixCardProps) {
  return (
    <div onClick={onClick} className="group cursor-pointer flex flex-col gap-3">
      <div className="relative aspect-square rounded-xl overflow-hidden shadow-lg hover-card-lift">
        {thumbnail ? (
          <img
            className="w-full h-full object-cover"
            alt={title}
            src={thumbnail}
          />
        ) : (
          <div className="w-full h-full bg-surface-container-highest flex items-center justify-center">
            <span className="material-symbols-outlined text-on-surface-variant text-[48px]">
              library_music
            </span>
          </div>
        )}
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#131315]/90 via-[#131315]/20 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <h4 className="text-[16px] leading-[24px] text-white font-bold mb-1">
            {title}
          </h4>
        </div>
        {/* Play FAB */}
        <div className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 shadow-xl">
          <span
            className="material-symbols-outlined"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            play_arrow
          </span>
        </div>
      </div>
      <p className="text-[14px] leading-[20px] text-on-surface-variant line-clamp-2">
        {description}
      </p>
    </div>
  );
}
