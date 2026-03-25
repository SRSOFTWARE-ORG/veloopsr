import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const IntroScreen = ({ onFinish }: { onFinish: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(() => onFinish(), 4200);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-white"
        style={{ willChange: "opacity" }}
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Logo container */}
        <motion.div
          className="absolute inset-0"
          style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
          initial={{ scale: 1.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.img
            src="/images/veloop-logo-3d.jpg"
            alt="Veloop"
            className="w-full h-full object-contain"
            style={{ willChange: "transform", transform: "translateZ(0)" }}
            animate={{ scale: [1, 1.02, 1] }}
            transition={{ duration: 5, ease: "easeInOut", repeat: Infinity }}
          />

          {/* Edge gradient blend */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `
                linear-gradient(to right, white 0%, transparent 15%, transparent 85%, white 100%),
                linear-gradient(to bottom, white 0%, transparent 15%, transparent 85%, white 100%)
              `,
            }}
          />

          {/* Shine sweep — GPU accelerated with translateX */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <motion.div
              className="absolute inset-0"
              style={{
                willChange: "transform",
                background:
                  "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.4) 42%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0.4) 58%, transparent 70%)",
              }}
              initial={{ x: "-150%" }}
              animate={{ x: "150%" }}
              transition={{
                duration: 1.8,
                delay: 1.2,
                ease: [0.25, 0.46, 0.45, 0.94],
                repeat: Infinity,
                repeatDelay: 2,
              }}
            />
          </div>
        </motion.div>

        {/* Exit fade */}
        <motion.div
          className="absolute inset-0 bg-white pointer-events-none"
          style={{ willChange: "opacity" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 3.4, ease: "easeIn" }}
        />
      </motion.div>
    </AnimatePresence>
  );
};

export default IntroScreen;
