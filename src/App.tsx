import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createIDBPersister } from "@/lib/query-persister";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import IntroScreen from "@/components/IntroScreen";
import { useFirebaseInit } from "@/hooks/useFirebase";

// Eager imports for critical pages — no lazy loading delay
import Dashboard from "@/pages/Dashboard";
import VendasPage from "@/pages/VendasPage";
import ProdutosPage from "@/pages/ProdutosPage";
import ClientesPage from "@/pages/ClientesPage";
import AgendaPage from "@/pages/AgendaPage";
import CaixaPage from "@/pages/CaixaPage";

// Lazy for less-used pages
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DocumentosPage = lazy(() => import("@/pages/DocumentosPage"));
const SegurancaPage = lazy(() => import("@/pages/SegurancaPage"));
const ConfiguracoesPage = lazy(() => import("@/pages/ConfiguracoesPage"));
const AssistenciaPage = lazy(() => import("@/pages/AssistenciaPage"));
const HistoricoEnviosPage = lazy(() => import("@/pages/HistoricoEnviosPage"));
const PixPaymentPage = lazy(() => import("@/pages/PixPaymentPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 30, // 30 min for persistence
      refetchOnWindowFocus: false,
      networkMode: "offlineFirst",
      retry: (failureCount) => navigator.onLine && failureCount < 2,
    },
    mutations: {
      networkMode: "offlineFirst",
    },
  },
});

const idbPersister = createIDBPersister();
const INTRO_SEEN_KEY = "veloop_intro_seen";

const ScreenLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
  </div>
);

const PageLoader = () => (
  <div className="min-h-[40vh] flex items-center justify-center">
    <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode; requirePrimaryAdmin?: boolean }> = ({ children, requirePrimaryAdmin }) => {
  const { user, loading, isPrimaryAdmin } = useAuth();

  if (loading) {
    return <ScreenLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requirePrimaryAdmin && !isPrimaryAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </AppLayout>
  );
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <ScreenLoader />;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <Suspense fallback={<ScreenLoader />}>{children}</Suspense>;
};

const App = () => {
  useFirebaseInit();

  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.location.pathname !== "/login" && sessionStorage.getItem(INTRO_SEEN_KEY) !== "true";
  });

  const handleIntroFinish = useCallback(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(INTRO_SEEN_KEY, "true");
    }
    setShowIntro(false);
  }, []);

  useEffect(() => {
    if (!showIntro) {
      return;
    }

    const introFailsafeTimer = window.setTimeout(handleIntroFinish, 1200);
    return () => window.clearTimeout(introFailsafeTimer);
  }, [handleIntroFinish, showIntro]);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: idbPersister, maxAge: 1000 * 60 * 60 * 24 }}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {showIntro && <IntroScreen onFinish={handleIntroFinish} />}
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route
                path="/login"
                element={
                  <PublicRoute>
                    <LoginPage />
                  </PublicRoute>
                }
              />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vendas"
                element={
                  <ProtectedRoute>
                    <VendasPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/produtos"
                element={
                  <ProtectedRoute>
                    <ProdutosPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/documentos"
                element={
                  <ProtectedRoute>
                    <DocumentosPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/clientes"
                element={
                  <ProtectedRoute>
                    <ClientesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/agenda"
                element={
                  <ProtectedRoute>
                    <AgendaPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/assistencia"
                element={
                  <ProtectedRoute>
                    <AssistenciaPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/seguranca"
                element={
                  <ProtectedRoute>
                    <SegurancaPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/configuracoes"
                element={
                  <ProtectedRoute>
                    <ConfiguracoesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/historico-envios"
                element={
                  <ProtectedRoute>
                    <HistoricoEnviosPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/caixa"
                element={
                  <ProtectedRoute>
                    <CaixaPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pagar/:cobrancaId/:dataVencimento"
                element={
                  <Suspense fallback={<ScreenLoader />}>
                    <PixPaymentPage />
                  </Suspense>
                }
              />
              <Route
                path="*"
                element={
                  <Suspense fallback={<ScreenLoader />}>
                    <NotFound />
                  </Suspense>
                }
              />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </PersistQueryClientProvider>
  );
};

export default App;
