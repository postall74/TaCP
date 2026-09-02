import { Box, Copy, Layers, Pencil, Plus, Trash2, Wand2, Cable, ShieldCheck, FolderLock, Info } from "lucide-react";

/* Тонкие обёртки над lucide с единой сигнатурой { size }. */
type P = { size?: number };

export const IcBox = ({ size = 16 }: P) => <Box size={size} strokeWidth={2} />;
export const IcCopy = ({ size = 16 }: P) => <Copy size={size} strokeWidth={2} />;
export const IcLayers = ({ size = 16 }: P) => <Layers size={size} strokeWidth={2} />;
export const IcPencil = ({ size = 16 }: P) => <Pencil size={size} strokeWidth={2} />;
export const IcPlus = ({ size = 16 }: P) => <Plus size={size} strokeWidth={2} />;
export const IcTrash = ({ size = 16 }: P) => <Trash2 size={size} strokeWidth={2} />;
export const IcWand = ({ size = 16 }: P) => <Wand2 size={size} strokeWidth={2} />;
export const IcCable = ({ size = 16 }: P) => <Cable size={size} strokeWidth={2} />;
export const IcShield = ({ size = 16 }: P) => <ShieldCheck size={size} strokeWidth={2} />;
export const IcLock = ({ size = 16 }: P) => <FolderLock size={size} strokeWidth={2} />;
export const IcInfo = ({ size = 16 }: P) => <Info size={size} strokeWidth={2} />;
