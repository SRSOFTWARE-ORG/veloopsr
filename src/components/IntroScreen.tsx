import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const ease = [0.22, 1, 0.36, 1];

const IntroScreen = ({ onFinish }: { onFinish: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(() => onFinish(), 4200);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
        style={{ background: "radial-gradient(ellipse at 50% 40%, #f0f4f8 0%, #dce3eb 50%, #c8d3df 100%)" }}
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Glow behind logo */}
        <motion.div
          className="absolute pointer-events-none"
          style={{
            width: "400px",
            height: "400px",
            background: "radial-gradient(circle, rgba(70,130,220,0.12) 0%, transparent 70%)",
          }}
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: 1, scale: [1, 1.15, 1] }}
          transition={{ duration: 2, delay: 0.3, ease, repeat: Infinity, repeatDelay: 1 }}
        />

        <div className="relative flex flex-col items-center gap-0">
          {/* Logo image */}
          <motion.div
            initial={{ scale: 0.15, opacity: 0, filter: "blur(8px)", rotate: -5 }}
            animate={{ scale: 1, opacity: 1, filter: "blur(0px)", rotate: 0 }}
            transition={{ duration: 1.1, ease }}
          >
            <motion.img
              src="/images/veloop-logo-3d.jpg"
              alt="Veloop"
              className="drop-shadow-2xl"
              style={{
                width: "min(85vw, 85vh, 520px)",
                height: "auto",
                mixBlendMode: "multiply",
              }}
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 4, ease: "easeInOut", repeat: Infinity }}
            />

            {/* Shine sweep */}
            <motion.div
              className="absolute inset-0 overflow-hidden pointer-events-none"
            >
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

          {/* Tagline */}
          <motion.p
            className="text-center font-bold tracking-[0.3em] uppercase select-none whitespace-nowrap"
            style={{
              fontSize: "clamp(0.65rem, 2.5vw, 1rem)",
              color: "#3a4a5c",
              marginTop: "-6px",
            }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1.8, ease }}
          >
            TUDO EM UM SÓ APP
          </motion.p>

          {/* Accent line */}
          <motion.div
            style={{
              height: "2px",
              background: "linear-gradient(90deg, transparent, #5a7da8, transparent)",
              marginTop: "10px",
            }}
            initial={{ width: 0 }}
            animate={{ width: 60 }}
            transition={{ duration: 0.8, delay: 2.1, ease }}
          />
        </div>

        {/* Exit fade */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 50% 40%, #f0f4f8 0%, #dce3eb 50%, #c8d3df 100%)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, scale: 1.08 }}
          transition={{ duration: 0.8, delay: 3.4, ease: "easeIn" }}
        />
      </motion.div>
    </AnimatePresence>
  );
};

export default IntroScreen;
