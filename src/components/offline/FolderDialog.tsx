"use client";

import { useState, useEffect } from "react";
import { X, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const FOLDER_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#06b6d4", // cyan
];

interface FolderDialogProps {
  initialName?: string;
  initialColor?: string;
  title: string;
  onConfirm: (name: string, color: string) => void;
  onCancel: () => void;
}

export function FolderDialog({
  initialName = "",
  initialColor = FOLDER_COLORS[0],
  title,
  onConfirm,
  onCancel,
}: FolderDialogProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);

  useEffect(() => {
    setName(initialName);
    setColor(initialColor);
  }, [initialName, initialColor]);

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed, color);
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen size={20} style={{ color }} />
            <h3 className="font-semibold text-on-surface">{title}</h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-full hover:bg-surface-container transition-colors"
          >
            <X size={16} className="text-on-surface-variant" />
          </button>
        </div>

        {/* Name input */}
        <div className="space-y-1">
          <label className="text-xs text-on-surface-variant font-medium">
            Folder name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chill vibes"
            maxLength={40}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
          />
        </div>

        {/* Colour picker */}
        <div className="space-y-1">
          <label className="text-xs text-on-surface-variant font-medium">
            Colour
          </label>
          <div className="flex flex-wrap gap-2">
            {FOLDER_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full transition-transform hover:scale-110 focus:outline-none"
                style={{
                  backgroundColor: c,
                  boxShadow:
                    color === c ? `0 0 0 3px white, 0 0 0 5px ${c}` : undefined,
                }}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!name.trim()}
            style={{ backgroundColor: color }}
            className="text-white hover:opacity-90"
          >
            {title === "New folder" ? "Create" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
