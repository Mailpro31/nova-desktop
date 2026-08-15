import React, { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { GripVertical, Settings } from "lucide-react";
import { loadCampusSession } from "@/lib/campusSession";
import { isServerReachable } from "@/lib/campusApi";
import { useCampusBubbleStore } from "@/stores/campusBubbleStore";
import type { CampusSession } from "@/lib/campusSession";

interface DragRef {
  startX: number;
  startY: number;
  initialX: number;
  initialY: number;
}

export const CampusStatusBubble: React.FC = () => {
  const { t } = useTranslation();
  const [session, setSession] = useState<CampusSession | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const dragRef = useRef<DragRef | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const { visible, position, setPosition, resetPosition } =
    useCampusBubbleStore();

  const check = useCallback(async () => {
    if (!session) return;
    setChecking(true);
    try {
      const r = await isServerReachable(session.server_url);
      setReachable(r);
    } catch {
      setReachable(false);
    } finally {
      setChecking(false);
    }
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    loadCampusSession().then((s) => {
      if (cancelled) return;
      setSession(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    check();
    const interval = window.setInterval(check, 30000);
    return () => window.clearInterval(interval);
  }, [session, check]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging || !dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPosition({
        x: Math.max(0, dragRef.current.initialX + dx),
        y: Math.max(0, dragRef.current.initialY + dy),
      });
    };

    const handleMouseUp = () => {
      setDragging(false);
      dragRef.current = null;
    };

    if (dragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, setPosition]);

  if (!session || !visible) return null;

  const serverName = (() => {
    try {
      return new URL(session.server_url).hostname;
    } catch {
      return session.server_url;
    }
  })();

  const statusColor =
    reachable === null
      ? "bg-mid-gray"
      : reachable
        ? "bg-success"
        : "bg-orange-400";

  const statusLabel =
    reachable === null
      ? t("campus.bubble.checking")
      : reachable
        ? t("campus.bubble.connected")
        : t("campus.bubble.offline");

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    setDragging(true);
    setShowMenu(false);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
    };
  };

  return (
    <div
      ref={bubbleRef}
      className={`fixed z-50 flex items-center gap-2 bg-white rounded-full shadow-lg border border-hairline pl-2 pr-1.5 py-1.5 select-none transition-shadow ${
        dragging ? "shadow-xl cursor-grabbing" : "cursor-grab hover:shadow-xl"
      }`}
      style={{
        left: position.x,
        top: position.y,
      }}
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowMenu(!showMenu);
      }}
    >
      <GripVertical
        size={14}
        className="text-text-secondary/50"
        strokeWidth={1.5}
      />
      <span
        className={`w-2 h-2 rounded-full ${checking ? "animate-pulse" : ""} ${statusColor}`}
      />
      <span className="text-xs font-medium text-text max-w-[140px] truncate">
        {serverName}
      </span>
      <span className="text-[10px] text-text-secondary hidden sm:inline">
        {statusLabel}
      </span>

      <button
        type="button"
        onClick={() => setShowMenu(!showMenu)}
        className="ml-1 p-1 rounded-full hover:bg-mid-gray/10 text-text-secondary"
      >
        <Settings size={12} strokeWidth={1.75} />
      </button>

      {showMenu && (
        <div
          className="absolute top-full right-0 mt-2 w-44 bg-white rounded-xl shadow-lg border border-hairline py-1 z-50"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              resetPosition();
              setShowMenu(false);
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text hover:bg-mid-gray/10 text-left"
          >
            {t("campus.bubble.resetPosition")}
          </button>
        </div>
      )}
    </div>
  );
};

export default CampusStatusBubble;
