import { type Transition, type Variants } from "framer-motion";

export const springSmooth: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 38,
  mass: 1,
};

export const springBouncy: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 28,
  mass: 0.9,
};

export const easeFastOut: Transition = {
  duration: 0.22,
  ease: [0.16, 1, 0.3, 1],
};

export const sheetVariants: Variants = {
  hidden: {
    y: "100%",
    opacity: 0.6,
    transition: { duration: 0.2, ease: [0.32, 0, 0.67, 0] },
  },
  visible: {
    y: 0,
    opacity: 1,
    transition: springSmooth,
  },
  exit: {
    y: "100%",
    opacity: 0,
    transition: { duration: 0.22, ease: [0.32, 0, 0.67, 0] },
  },
};

export const scrimVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.18 } },
};

export const hudTopVariants: Variants = {
  hidden: {
    y: -32,
    opacity: 0,
    transition: { duration: 0.18, ease: "easeIn" },
  },
  visible: {
    y: 0,
    opacity: 1,
    transition: springSmooth,
  },
  exit: {
    y: -32,
    opacity: 0,
    transition: { duration: 0.18, ease: "easeIn" },
  },
};

export const hudBottomVariants: Variants = {
  hidden: {
    y: 40,
    opacity: 0,
    transition: { duration: 0.18, ease: "easeIn" },
  },
  visible: {
    y: 0,
    opacity: 1,
    transition: springSmooth,
  },
  exit: {
    y: 40,
    opacity: 0,
    transition: { duration: 0.18, ease: "easeIn" },
  },
};

export const fadeScaleVariants: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.12, ease: "easeIn" },
  },
};

export const listContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
  },
};
