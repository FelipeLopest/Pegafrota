> **REFERÊNCIA:** documento de arquitetura original/blueprint. Migrations e código executável são a fonte final de verdade; para o estado atual consolidado, comece por `docs/ia/`.

# Questões Abertas Não Bloqueantes

A arquitetura adotou padrões para iniciar sem interromper o projeto.

## 1. Motor OCR

Padrão: adapter + prova de conceito local antes da escolha final.

Decisão necessária na fase 9 após medir:

- acurácia;
- latência;
- suporte a placas brasileiras;
- distribuição Windows;
- CPU/GPU;
- licença.

## 2. Retenção de imagem

Padrão: não armazenar imagem no MVP.

Armazenar somente se houver necessidade operacional e política de retenção.

## 3. E-mail global

Supabase Auth trata e-mail de login como identidade global.

Padrão: aceitar unicidade global, mais restritiva que a regra “dentro da empresa”.

## 4. Múltiplas empresas por usuário

Padrão: uma empresa ativa por usuário no MVP.

A tabela de memberships permite evolução futura.

## 5. Offline

Padrão: online-first, sem escrita de negócio offline.

## 6. Assinatura de código

Não bloqueia desenvolvimento, mas é obrigatória antes de distribuição comercial.

## 7. Recuperação de senha

Será implementada com o fluxo do Supabase Auth e deep link/protocolo seguro na fase de Auth, caso permaneça no escopo.

## 8. Endereço

Padrão: campos estruturados básicos, evitando JSONB livre quando filtros forem necessários.
