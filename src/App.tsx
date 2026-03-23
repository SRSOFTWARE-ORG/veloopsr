import { useState, useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import IntroScreen from "@/components/IntroScreen";
import LoginPage from "@/pages/LoginPage";
import Dashboard from "@/pages/Dashboard";
import VendasPage from "@/pages/VendasPage";
import ProdutosPage from "@/pages/ProdutosPage";
import DocumentosPage from "@/pages/DocumentosPage";
import SegurancaPage from "@/pages/SegurancaPage";
import ConfiguracoesPage from "@/pages/ConfiguracoesPage";
import ClientesPage from "@/pages/ClientesPage";
import AgendaPage from "@/pages/AgendaPage";
import AssistenciaPage from "@/pages/AssistenciaPage";
import CaixaPage from "@/pages/CaixaPage";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const App = () => {
  const [showIntro, setShowIntro] = useState(true);
  const handleIntroFinish = useCallback(() => setShowIntro(false), []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {showIntro && <IntroScreen onFinish={handleIntroFinish} />}
        <BrowserRouter>
          <AuthProvider>
            <Routes>
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/vendas" element={<ProtectedRoute><VendasPage /></ProtectedRoute>} />
            <Route path="/produtos" element={<ProtectedRoute><ProdutosPage /></ProtectedRoute>} />
            <Route path="/documentos" element={<ProtectedRoute><DocumentosPage /></ProtectedRoute>} />
            <Route path="/clientes" element={<ProtectedRoute><ClientesPage /></ProtectedRoute>} />
            <Route path="/agenda" element={<ProtectedRoute><AgendaPage /></ProtectedRoute>} />
            <Route path="/assistencia" element={<ProtectedRoute><AssistenciaPage /></ProtectedRoute>} />
            <Route path="/seguranca" element={<ProtectedRoute><SegurancaPage /></ProtectedRoute>} />
            <Route path="/configuracoes" element={<ProtectedRoute><ConfiguracoesPage /></ProtectedRoute>} />
            <Route path="/caixa" element={<ProtectedRoute><CaixaPage /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
