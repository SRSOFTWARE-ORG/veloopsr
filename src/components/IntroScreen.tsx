import { useState, useEffect } from "react";

const IntroScreen = ({ onFinish }: { onFinish: () => void }) => {
  const [phase, setPhase] = useState<"enter" | "visible" | "exit">("enter");

  useEffect(() => {
    const enterTimer = setTimeout(() => setPhase("visible"), 800);
    const exitTimer = setTimeout(() => setPhase("exit"), 3200);
    const finishTimer = setTimeout(() => onFinish(), 4000);
    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(finishTimer);
    };
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-700 ${
        phase === "exit" ? "opacity-0" : "opacity-100"
      }`}
      style={{
        background: "linear-gradient(135deg, #f8f9fa 0%, #e8ecf1 50%, #f0f2f5 100%)",
      }}
    >
      <div className="relative flex flex-col items-center">
        {/* Logo with entrance animation */}
        <div
          className={`relative transition-all duration-1000 ease-out ${
            phase === "enter"
              ? "scale-90 opacity-0 translate-y-4"
              : "scale-100 opacity-100 translate-y-0"
          }`}
        >
          <img
            src="/images/veloop-logo.png"
            alt="Veloop"
            className="w-56 h-auto sm:w-72 md:w-80 drop-shadow-lg"
          />

          {/* Shine sweep effect over the arrow area */}
          <div
            className="absolute inset-0 overflow-hidden pointer-events-none rounded-xl"
            style={{ maskImage: "url(/images/veloop-logo.png)", maskSize: "contain", maskRepeat: "no-repeat", maskPosition: "center", WebkitMaskImage: "url(/images/veloop-logo.png)", WebkitMaskSize: "contain", WebkitMaskRepeat: "no-repeat", WebkitMaskPosition: "center" }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.7) 45%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0.7) 55%, transparent 60%)",
                animation: "shineSweep 2.4s ease-in-out infinite",
              }}
            />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shineSweep {
          0% { transform: translateX(-150%); }
          40% { transform: translateX(150%); }
          100% { transform: translateX(150%); }
        }
      `}</style>
    </div>
  );
};

export default IntroScreen;
