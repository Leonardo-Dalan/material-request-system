# Sistema de Solicitação de Materiais — Especificação v1

**Status:** rascunho para validação | **Data:** 2026-10-19
**Stack:** HTML + CSS + JS puro, localStorage, Firebase Realtime Database (igual ao OEE Panel)
**Estratégia:** REA inspirado no fluxo do PRMS (sem copiar código — PRMS não tem licença usável)

## 1. Problema atual

O processo hoje é o formulário em papel **"Material Movement Log"** (foto registrada em 19/10/2026):
colunas Item Number, Item Description, Quantity Ordered, Quantity Moved, Job Number + Date e Requesting Area.

**Gargalos:**
- Precisa da folha física em mãos (se não tiver, pede pra alguém)
- Escrita à mão (ilegível, sem padrão)
- Precisa saber o PN do material de cabeça ou pedir ajuda
- Sem foto, sem informação de disponibilidade, sem localização no estoque
- Sem histórico consultável, sem métricas

## 2. Usuários e papéis

| Papel | Quem | Pode fazer |
|---|---|---|
| `REQUESTER` | Operador / funcionário da produção | Buscar no catálogo, criar solicitação, ver próprias solicitações |
| `LOGISTICS` | Operador logístico / almoxarifado | Ver fila de solicitações, marcar como working/done/rejected (com motivo), gerenciar catálogo |
| `ADMIN` | Administrador | Tudo + cadastrar usuários, configurações |

**Auth:** login + senha com hash SHA-256 + salt (mesmo padrão do OEE Panel). Senha de admin para cadastro e controle.

## 3. Fluxo (SEM aprovação — decisão do Leo, 19/10/2026)

O operador entrega em mãos para a logística; não há etapa de aprovação gerencial.

```
REQUESTER                          LOGISTICS
   │                                   │
   │  1. Busca item (PN/nome)          │
   │  2. Seleciona + quantidade        │
   │  3. Local de entrega + Job #      │
   │  4. Urgência (normal/urgente)     │
   │  5. Envia ───────────────────────►│  Fila de solicitações
   │                                   │  (item, foto, qtd, solicitante,
   │                                   │   área, local entrega, job #,
   │                                   │   urgência, localização no estoque)
   │                                   │
   │                                   │  6. Marca: WORKING → DONE
   │                                   │     ou REJECTED (+ motivo)
   │  ◄────────────────────────────────│  7. Status visível ao solicitante
```

**Notificação:** fila no app em primeiro lugar (a fila JÁ é a notificação). E-mail como complemento futuro.

## 4. Catálogo de materiais (o coração do sistema)

Cada item: **PN, nome, subcategoria, foto, localização no estoque, unidade** (peça, rolo, metro, kg…).

- Busca por **PN ou nome** ("TAPE" → todas as tapes de vários tamanhos; "ISOLACAO" → todas as isolações)
- Navegação por **subcategorias**
- **Fotos:** começar pelos ~50 itens mais pedidos; resto entra com o tempo (upload pelo admin, pode fotografar com o celular)
- **Cadastro:** tela de admin (CRUD) + **importação de Excel/CSV** (a logística provavelmente já tem uma planilha de PNs)
- ⚠️ **Risco nº 1:** catálogo vazio = app morto. Alguém da logística precisa ser dono dos dados.

## 5. Estoque (fase 1: simples e honesto)

- Cada solicitação **atendida** vira automaticamente uma **saída** registrada → saldo corrente por item
- Entradas registradas pela logística (recebimento)
- O saldo é **informativo**, não promessa de tempo real — a precisão depende da disciplina de registrar movimentações
- Fase 2: controle de estoque completo, ponto de reposição, alertas

## 6. Relatórios

Por **dia / semana / mês / trimestre / ano**:
- Tudo que foi solicitado
- Tudo que foi atendido (por quem, em quanto tempo)
- Tudo que foi rejeitado (+ motivos — vira Pareto de rejeições)
- Itens mais pedidos (top itens → ajuda a decidir o que fotografar/estocar)

## 7. Telas (MVP)

1. **Nova solicitação** — busca, seleção, quantidade, local de entrega, job number, urgência
2. **Minhas solicitações** — status de cada pedido + botão "pedir de novo"
3. **Fila da logística** — pedidos novos/urgentes no topo, ações working/done/rejected
4. **Catálogo (admin/logística)** — CRUD + importação CSV + fotos
5. **Usuários (admin)** — cadastro e papéis
6. **Relatórios** — filtros por período + exportação CSV

## 8. Dispositivos

- **Fase 1:** PCs dos operadores (produção + logística) — wifi cobre a fábrica
- **Fase 2:** **totem de solicitações** — tablet em ponto estratégico mapeado (perto do almoxarifado/corredor), login rápido por PIN + logout automático por inatividade

## 9. Fases

**MVP (fase 1):** catálogo + busca, fluxo de solicitação, fila da logística, auth + admin, histórico, relatórios básicos.
**Fase 2:** totem, notificações por e-mail, controle de estoque completo, dashboard analítico, fotos do catálogo inteiro.

## 10. Decisões registradas

- 2026-10-19: sem etapa de aprovação (operador entrega em mãos pra logística) — validado pelo Leo
- 2026-10-19: wifi cobre a fábrica → online-first (sem necessidade de modo offline na fase 1)
- 2026-10-19: totem fica pra fase 2
- 2026-10-19: stack igual ao OEE (HTML/JS + Firebase), build do zero inspirado no PRMS
