import { createElement } from "react";
import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import { emit } from "@tauri-apps/api/event";
import { toast, type ToastT } from "sonner";

type AttentionVariant = "error" | "warning" | "info";
type AttentionOptions = NonNullable<Parameters<typeof toast.error>[1]>;

const unread = new Set<string | number>();

const syncBadge = () => {
  void emit("notification-attention", unread.size > 0);
};

export const markAttentionSeen = () => {
  unread.clear();
  syncBadge();
};

export const showAttentionToast = (
  variant: AttentionVariant,
  title: string,
  options: AttentionOptions = {},
) => {
  let id: string | number = "pending";
  const Icon =
    variant === "error"
      ? CircleAlert
      : variant === "warning"
        ? TriangleAlert
        : Info;
  const iconClass = variant === "error" ? "text-red-400" : "text-mid-gray";
  const clearUnread = (dismissedToast: ToastT) => {
    unread.delete(id);
    syncBadge();
    options.onDismiss?.(dismissedToast);
  };
  const persistentOptions: AttentionOptions = {
    ...options,
    duration: Infinity,
    closeButton: true,
    icon: createElement(Icon, {
      size: 18,
      strokeWidth: 2,
      strokeLinecap: "round",
      className: iconClass,
      "aria-hidden": true,
    }),
    onDismiss: clearUnread,
  };

  if (variant === "error") id = toast.error(title, persistentOptions);
  else if (variant === "warning") id = toast.warning(title, persistentOptions);
  else id = toast.info(title, persistentOptions);

  unread.add(id);
  syncBadge();
  return id;
};
