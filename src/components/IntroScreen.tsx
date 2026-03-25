import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const ease = [0.22, 1, 0.36, 1];

const IntroScreen = ({ onFinish }: { onFinish: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(() => onFinish(), 8200);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
        style={{ background: "#FFFFFF" }}
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* SVG Loop + Arrow drawing */}
        <div className="relative flex flex-col items-center">
          {/* SVG Icon - V Loop with Arrow */}
          <motion.svg
            viewBox="0 0 200 160"
            className="w-[min(60vw,280px)] h-auto drop-shadow-lg"
            style={{ filter: "drop-shadow(0 8px 24px rgba(26,122,76,0.18))" }}
          >
            <defs>
              <linearGradient id="loopGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1a7a4c" />
                <stop offset="50%" stopColor="#2196a8" />
                <stop offset="100%" stopColor="#1a7a4c" />
              </linearGradient>
              <linearGradient id="arrowGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2196a8" />
                <stop offset="100%" stopColor="#1ac76c" />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* V-Loop path */}
            <motion.path
              d="M 30 30 L 70 120 L 110 50 Q 130 10 160 30 Q 190 50 170 80 Q 155 105 130 100 Q 110 95 100 80"
              fill="none"
              stroke="url(#loopGrad)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glow)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 2, ease, delay: 0 }}
            />

            {/* Arrow head */}
            <motion.path
              d="M 120 55 L 135 35 L 115 40"
              fill="none"
              stroke="url(#arrowGrad)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glow)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.5, ease, delay: 2 }}
            />

            {/* Light trail on arrow */}
            <motion.circle
              cx="135"
              cy="35"
              r="6"
              fill="rgba(26,199,108,0.5)"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 0.8, 0], scale: [0, 2, 0] }}
              transition={{ duration: 1, delay: 2.8, ease: "easeOut" }}
            />
          </motion.svg>

          {/* 3D Parallax Effect on the whole logo group */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            initial={{ rotateY: 0, perspective: 800 }}
            animate={{ rotateY: [0, 8, -4, 0] }}
            transition={{ duration: 1.5, delay: 4, ease }}
            style={{ perspective: 800, transformStyle: "preserve-3d" }}
          />

          {/* Logo image with 3D effect */}
          <motion.div
            className="mt-2"
            initial={{ opacity: 0, y: 40, rotateY: -15 }}
            animate={{ opacity: 1, y: 0, rotateY: 0 }}
            transition={{ duration: 1.2, delay: 4, ease }}
            style={{ perspective: 1000, transformStyle: "preserve-3d" }}
          >
            <motion.img
              src="/images/veloop-logo-3d.jpg"
              alt="Veloop"
              className="w-[min(70vw,340px)] h-auto rounded-lg"
              style={{
                filter: "drop-shadow(0 12px 32px rgba(0,0,0,0.12))",
                mixBlendMode: "multiply",
              }}
              animate={{
                rotateY: [0, 3, -2, 0],
              }}
              transition={{ duration: 2, delay: 4.2, ease }}
            />
          </motion.div>

          {/* "Veloop" text */}
          <motion.h1
            className="font-sans font-extrabold tracking-tight select-none"
            style={{
              fontSize: "clamp(2rem, 8vw, 3.5rem)",
              background: "linear-gradient(135deg, #1a7a4c, #2196a8)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textShadow: "none",
            }}
            initial={{ opacity: 0, y: 30, letterSpacing: "0.15em" }}
            animate={{ opacity: 1, y: 0, letterSpacing: "0.02em" }}
            transition={{ duration: 1, delay: 5.5, ease }}
          >
            Veloop
          </motion.h1>

          {/* Slogan */}
          <motion.p
            className="font-sans font-bold tracking-[0.35em] uppercase select-none"
            style={{
              fontSize: "clamp(0.6rem, 2.2vw, 0.9rem)",
              color: "#3a4a5c",
            }}
            initial={{ opacity: 0, filter: "blur(10px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 1, delay: 6.5, ease }}
          >
            TUDO EM UM SÓ APP
          </motion.p>

          {/* Accent line */}
          <motion.div
            style={{
              height: "2px",
              background: "linear-gradient(90deg, transparent, #1a7a4c, #2196a8, transparent)",
              marginTop: "12px",
            }}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 80, opacity: 1 }}
            transition={{ duration: 0.8, delay: 6.8, ease }}
          />

          {/* Light sweep across logo */}
          <motion.div
            className="absolute inset-0 pointer-events-none overflow-hidden"
            style={{ borderRadius: "8px" }}
          >
            <motion.div
              className="absolute inset-y-0 w-20"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)",
              }}
              initial={{ x: "-100%" }}
              animate={{ x: ["−100%", "500%"] }}
              transition={{ duration: 0.8, delay: 7.5, ease: "easeInOut" }}
            />
          </motion.div>
        </div>

        {/* Exit fade */}
        <motion.div
          className="absolute inset-0 bg-white pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 7.8, ease: "easeIn" }}
        />
      </motion.div>
    </AnimatePresence>
  );
};

export default IntroScreen;
