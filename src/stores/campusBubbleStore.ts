import { create } from "zustand";

interface BubblePosition {
  x: number;
  y: number;
}

interface CampusBubbleState {
  visible: boolean;
  position: BubblePosition;
  setVisible: (visible: boolean) => void;
  setPosition: (position: BubblePosition) => void;
  resetPosition: () => void;
}

const STORAGE_KEY = "nova_campus_bubble";
const DEFAULT_POSITION: BubblePosition = { x: 16, y: 16 };

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        visible: parsed.visible !== false,
        position: parsed.position || DEFAULT_POSITION,
      };
    }
  } catch {
    // ignore
  }
  return { visible: true, position: DEFAULT_POSITION };
}

function saveState(visible: boolean, position: BubblePosition) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ visible, position }));
  } catch {
    // ignore
  }
}

const initial = loadState();

export const useCampusBubbleStore = create<CampusBubbleState>((set) => ({
  visible: initial.visible,
  position: initial.position,
  setVisible: (visible) => {
    set((state) => {
      saveState(visible, state.position);
      return { visible };
    });
  },
  setPosition: (position) => {
    set((state) => {
      saveState(state.visible, position);
      return { position };
    });
  },
  resetPosition: () => {
    set((state) => {
      saveState(state.visible, DEFAULT_POSITION);
      return { position: DEFAULT_POSITION };
    });
  },
}));
