# Plano de correções

## 1. Erro de análise (carnê LUCAS C55) + futuros
- Em `scan-carne`/`scan-document`: aumentar timeout do Gemini (60s → 120s) e adicionar retry com backoff (2 tentativas) quando o modelo retornar `null`/JSON inválido.
- Validar antes de inserir: rejeitar registros sem `cliente_nome` e sem `valor > 0` (gera mensagem clara em vez de "documento com erro" silencioso).
- Reprocessar automaticamente o `CARNE LUCAS C55.pdf` depois do deploy.

## 2. Deduplicação de documentos importados
Problema atual: o mesmo cliente pode ter NFe/Carnê duplicados quando reescaneado.
- Adicionar coluna `hash_arquivo` (sha256 do PDF) na tabela `documentos`.
- Constraint `UNIQUE (hash_arquivo)` — bloqueia o mesmo PDF.
- Constraint lógica adicional na edge function: para `Carnê`, antes de inserir verificar se já existe `(cliente_id, tipo='Carnê', valor_total, numero_parcelas)` igual; se sim, atualizar em vez de duplicar.
- **Importante:** vários produtos por cliente continuam permitidos — a dedup é por documento, não por venda.

## 3. Performance (lentidão geral)
Causas identificadas no review:
- `QueryClient` com `staleTime` curto refazendo requests a cada navegação.
- Listagens carregando todos os registros (clientes, vendas, documentos) sem paginação.
- Carregamento eager de rotas grandes (Dashboard, Documentos) no bundle inicial.

Ações:
- Subir `staleTime` para 5 min e `gcTime` para 15 min nas queries de listagens estáticas (clientes, produtos, dispositivos).
- Adicionar `select` no Supabase para trazer apenas colunas necessárias nas listas (sem `base64`/`pdf_url` pesados).
- `React.lazy` + `Suspense` nas rotas pesadas: Documentos, Assistência, Comunicados, WhatsAppMonitor, Histórico.
- Splash/intro: reduzir de 1.8s → 800ms (memo já registra como crítico, mas mantém percepção de marca).
- Prefetch da sessão e do perfil em paralelo no `AppLayout` (hoje é sequencial).

## 4. VAPID + Push fora do app
Secrets já existem; vou **atualizar** com os valores fornecidos e adicionar `VAPID_SUBJECT`.
- Tabela `push_subscriptions` (user_id, endpoint, p256dh, auth, user_agent) — se já existir, garantir índice.
- Edge function `web-push-send` usando `npm:web-push@3` com VAPID.
- Service Worker `public/sw-push.js` separado do FCM (não conflita): escuta `push` e exibe notificação nativa com badge/ícone do app, suporta clique para abrir rota.
- Substituir/complementar trigger interno: `check-payment-reminders` e novas cobranças disparam `web-push-send` para todas as subscriptions ativas, **além** do FCM existente.

## 5. Prompt de permissão no primeiro acesso
- Hook `useFirstVisitPushPrompt` no `AppLayout`:
  - Detecta `localStorage.getItem('push_prompt_shown') !== 'true'` e usuário autenticado.
  - Mostra `Dialog` iOS-style após 3s do login, com texto explicativo: "Ativar notificações de cobranças e pagamentos?".
  - Se aceito: `Notification.requestPermission()` → registra subscription com a chave VAPID pública → salva em `push_subscriptions`.
  - Marca flag para não repetir.

## Arquivos a tocar
- `supabase/functions/scan-carne/index.ts`, `scan-document/index.ts`
- `supabase/functions/web-push-send/index.ts` (novo)
- `supabase/functions/check-payment-reminders/index.ts` (chamar web-push)
- `supabase/migrations/*` (hash_arquivo + unique + push_subscriptions se faltando)
- `public/sw-push.js` (novo)
- `src/lib/pushNotifications.ts` (novo)
- `src/components/FirstVisitPushPrompt.tsx` (novo)
- `src/components/AppLayout.tsx` (montar prompt + lazy routes)
- `src/App.tsx` (lazy imports)
- `src/lib/queryClient.ts` (ajuste de cache)
- `src/components/IntroScreen.tsx` (duração)

## Sem mudanças
- Lógica de juros (R$3/dia já aplicada).
- Layout/estilo das telas (flat, SF Pro, cor verde, dock mobile).
- Fluxo do bot WhatsApp, n8n, Mercado Pago.

Posso seguir?