# Dagräknare

Följ hur många dagar du klarat en vana: dagar i rad, dagar totalt och hur långt det är kvar till målet. Du kan rätta tidigare dagar i kalendern. Flera vanor, eget mål per vana. PWA för telefonen och en widget för iOS via Scriptable.

Eget projekt med eget bygge och egna databasmigrationer (körs för hand i Supabase Studio).

```sh
cd dagraknare
npm install
npm run dev          # http://localhost:8081
npm test             # stats + widgetkopian (vitest)
npm run test:db      # RLS, synk och widgetnyckel mot riktig Postgres (PGlite)
npm run typecheck
npm run build
npm run icons        # ritar om ikonerna i public/icons
```

## Så sätter du upp det

### 1. Databasen (Supabase)

Rekommendation: ett **eget Supabase-projekt**, så att kvoten (egress, lagring) inte delas med andra appar. Free-nivån tillåter två aktiva projekt. Det går också bra att återanvända ett befintligt projekt: tabellerna heter `habits`, `habit_days` och `habit_widget_tokens`.

1. Supabase → SQL Editor → klistra in och kör `supabase/migrations/20261014090000_habits.sql`. Filen går att köra om utan skada.
2. Authentication → URL Configuration: lägg in appens adress som **Site URL** och under **Redirect URLs** (`https://<din-adress>/**` och `http://localhost:8081/**`).
3. Vill du stänga för andra: Authentication → Sign In / Providers → stäng av "Allow new users to sign up" när du själv har skapat ditt konto.

Migrationen körs för hand. Inget i repot kör den automatiskt.

### 2. Miljövariabler

Kopiera `.env.example` till `.env` och fyll i `VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY` (Project Settings → API). Anon/publishable-nyckeln är avsedd att vara publik. Lägg aldrig `service_role` här.

### 3. Publicera (Cloudflare Pages)

Skapa ett Pages-projekt kopplat till det här repot.

- Root directory: tomt (repots rot)
- Build command: `npm run build`
- Output directory: `dist`
- Miljövariablerna från steg 2 under Settings → Environment variables.

Lägg sedan in den nya adressen i Supabase (steg 1.2).

### 4. På telefonen

Öppna adressen i Safari → Dela → Lägg till på hemskärmen. Logga in en gång. Appen fungerar utan nät och synkar när du är online igen.

### 5. Widgeten (Scriptable)

I appen: Inställningar → Widget för hemskärmen → Skapa widget-nyckel → Kopiera widget-skript. Klistra in i ett nytt skript i Scriptable och lägg till en Scriptable-widget på hemskärmen. Skriv en vanas namn i widgetens Parameter om du vill välja vana.

Storlekar: liten, medel, stor (upp till fyra vanor) samt låsskärmens cirkel, rektangel och rad.

## Hur det hänger ihop

**Lokalt först.** Skärmen läser alltid ur `localStorage` (`src/lib/store.ts`). Ändringar sparas direkt och skickas till Supabase i bakgrunden. Det som ändrats på andra enheter hämtas med `server_ts > senast hämtat`, så egress hålls nere. Hämtningen är sidindelad (Supabase kapar tyst svar vid 1 000 rader).

**Nyast vinner, per vana och per dag.** `upsert_habits` och `upsert_habit_days` skriver bara över en rad om den inkommande ändringen är nyare. En enhet som legat offline en vecka kan därför inte skriva över nyare rättelser.

**Allt räknas ur dagposterna** (`src/lib/stats.ts`): streak, längsta, totalt, avbrott och månadssiffror. Inget av det lagras. Rättar du en dag bakåt räknas hela historiken om, och kalendern visar vad som hände ("Dagar i rad: 18 → 25 (två perioder slogs ihop)").

**Tre lägen per dag:** klarad, missad och ej angiven. Båda de två sista bryter streaken. Skillnaden är att "ej angiven" visas annorlunda, så du ser vilka dagar du kan ha glömt.

**En oregistrerad idag bryter inte streaken.** Dagen är inte slut. Markerar du idag som missad är streaken noll.

**Dygnsgräns.** Per vana kan du välja att dygnet byter klockan 01–06 i stället för midnatt, så en registrering efter midnatt hamnar på rätt dag. Widgeten använder samma inställning.

**Arkivera, inte radera.** En vana arkiveras (döljs, historiken sparas) och kan återställas. Permanent radering finns inte, eftersom en raderad rad inte når andra enheter i en synk som bygger på ändringstid.

### Widgetens åtkomst

Widgeten loggar inte in. Den anropar `habit_widget(p_token)` anonymt med en slumpad nyckel (UUID) som bara kan **läsa** dina icke-arkiverade vanor. Funktionen är `security definer` och returnerar bara data för nyckelns ägare. Byter du nyckel i appen slutar den gamla fungera direkt. Skriptet i Scriptable innehåller nyckeln, så behandla det som ett lösenord.

Widgeten kan inte bocka av en dag. Scriptable saknar knappar i widgets, och ett tryck öppnar appen i **Safari**, inte den installerade hemskärmsappen (iOS skickar inte webblänkar vidare till PWA:er). Bocka av i appen.

### Två kopior av räknelogiken

`widget/dagraknare-widget.cjs` har en egen kopia av `computeStats`, eftersom Scriptable inte kan importera från appen. `src/lib/stats.test.ts` kör 200 slumpade historier genom båda och kräver samma svar. Ändrar du räkningen i `stats.ts`: ändra i widgetfilen också, annars slår testet till.

## Begränsningar

- Widgeten är **ej provkörd på en riktig iPhone**. Den är skriven mot Scriptables dokumenterade API och logiken är testad i Node, men själva ritandet (storlekar, marginaler, låsskärmen) behöver ses på en enhet och kan behöva justeras.
- Widgeten uppdateras när iOS bestämmer (cirka var 30:e minut som mest). Appen kan inte tvinga fram en uppdatering.
- Ingen realtid mellan enheter: synk sker vid start, när appen kommer i förgrunden, när nätet återkommer och efter varje ändring.
- Inloggning med e-post och lösenord. Ingen återställning av lösenord är inbyggd i appen; använd Supabase-dashboarden.
