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
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Logo image filling entire screen */}
        <motion.div
          className="absolute inset-0"
          initial={{ scale: 1.3, opacity: 0, filter: "blur(8px)" }}
          animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.img
            src="/images/veloop-logo-3d.jpg"
            alt="Veloop"
            className="w-full h-full object-cover"
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ duration: 4, ease: "easeInOut", repeat: Infinity }}
          />

          {/* Shine sweep */}
          <motion.div className="absolute inset-0 overflow-hidden pointer-events-none">
            <motion.div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.5) 40%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0.5) 60%, transparent 70%)",
              }}
              initial={{ x: "-200%" }}
              animate={{ x: ["-200%", "200%"] }}
              transition={{ duration: 2, delay: 1, ease: "easeInOut", repeat: Infinity, repeatDelay: 1 }}
            />
          </motion.div>
        </motion.div>

        {/* Exit fade */}
        <motion.div
          className="absolute inset-0 bg-white pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 3.4, ease: "easeIn" }}
        />
      </motion.div>
    </AnimatePresence>
  );
};

export default IntroScreen;
