# Scoring-strategi för Lead-prioritering

## Översikt

Scoring-systemet klassificerar personer i tre nivåer baserat på en kombinerad poäng (0-100):

| Tier | Poäng | Beskrivning |
|------|-------|-------------|
| **GOLD** | ≥ 70 | Högsta prioritet - kvalificerade leads |
| **SILVER** | 40-69 | Medelprioritet - potential finns |
| **BRONZE** | < 40 | Lägre prioritet - behöver nurturing |

---

## Scoring-modell

Den kombinerade poängen viktas mellan **person** och **företag**:

```
Kombinerad poäng = (Person-score × 60%) + (Företags-score × 40%)
```

### Varför 60/40-fördelning?

- **Person (60%)**: I B2B är relationen med rätt person avgörande. En stark relation med en beslutsfattare väger tyngre än företagets storlek.
- **Företag (40%)**: Företagets potential (storlek, tillväxt, bransch) ger kontext och kvalificerar affärsmöjligheten.

---

## Person-score (60% av total)

Person-scoren byggs upp av tre faktorer:

| Faktor | Vikt | Beskrivning |
|--------|------|-------------|
| Roll/Funktion | 40% | Beslutsfattarroll ger högre poäng |
| Relationsstyrka | 30% | Hur väl ni känner varandra |
| Engagemang | 30% | Aktiviteter senaste 90 dagarna |

### Roll-poäng

| Roll | Poäng |
|------|-------|
| CEO, VD | 100 |
| Styrelse | 95 |
| C-level (CFO, COO, CTO) | 90 |
| VP, Director | 80 |
| Chef, Manager | 70 |
| Specialist, Senior | 50 |
| Övriga | 30 |

### Relationsstyrka

| Relation | Poäng |
|----------|-------|
| Vi känner varandra | 100 |
| Vi har träffats | 75 |
| Har haft kontakt | 50 |
| Känner till | 25 |
| Okänd | 0 |

### Engagemang (aktiviteter 90 dagar)

| Antal aktiviteter | Poäng |
|-------------------|-------|
| 10+ | 100 |
| 5-9 | 75 |
| 2-4 | 50 |
| 1 | 25 |
| 0 | 0 |

---

## Företags-score (40% av total)

Företags-scoren byggs upp av fem faktorer:

| Faktor | Vikt | Beskrivning |
|--------|------|-------------|
| Omsättning | 25% | Företagets storlek |
| Tillväxt (CAGR 3Y) | 20% | Tillväxttakt senaste 3 åren |
| Branschpassning | 20% | Hur väl branschen matchar er målgrupp |
| Avstånd till Göteborg | 20% | Geografisk närhet (närmare = högre poäng) |
| Befintlig score | 15% | Eventuell extern rating/score |

### Omsättning

| Omsättning (MSEK) | Poäng |
|-------------------|-------|
| > 500 | 100 |
| 100-500 | 85 |
| 50-100 | 70 |
| 10-50 | 50 |
| < 10 | 30 |

### Tillväxt (CAGR 3 år)

| CAGR | Poäng |
|------|-------|
| > 20% | 100 |
| 10-20% | 80 |
| 5-10% | 60 |
| 0-5% | 40 |
| Negativ | 20 |

### Branschpassning

Målbranscher som ger full poäng (100):
- Tech / IT
- SaaS
- Fintech
- E-commerce
- Consulting

Övriga branscher får reducerad poäng baserat på strategisk relevans.

### Avstånd till Göteborg

| Avstånd (km) | Poäng | Exempel |
|--------------|-------|---------|
| 0-50 | 100 | Göteborg, Mölndal, Kungsbacka |
| 51-100 | 85 | Borås, Trollhättan, Varberg |
| 101-200 | 70 | Jönköping, Halmstad |
| 201-400 | 55 | Malmö, Örebro |
| 401-600 | 40 | Stockholm, Uppsala |
| 601-1000 | 25 | Sundsvall, Umeå |
| >1000 | 15 | Utomlands, okänt |

---

## Räkneexempel

### Exempel: Maria Johansson, CFO på TechBolag AB

**Person-data:**
- Roll: CFO → 90 poäng
- Relation: "Vi har träffats" → 75 poäng
- Aktiviteter (90d): 6 st → 75 poäng

**Person-score:** (90 × 0.4) + (75 × 0.3) + (75 × 0.3) = 36 + 22.5 + 22.5 = **81**

**Företags-data:**
- Omsättning: 75 MSEK → 70 poäng
- CAGR: 15% → 80 poäng
- Bransch: Tech → 100 poäng
- Avstånd: 30 km (Mölndal) → 100 poäng
- Befintlig score: 70 → 70 poäng

**Företags-score:** (70 × 0.25) + (80 × 0.20) + (100 × 0.20) + (100 × 0.20) + (70 × 0.15) = 17.5 + 16 + 20 + 20 + 10.5 = **84**

**Kombinerad score:** (81 × 0.6) + (84 × 0.4) = 48.6 + 33.6 = **82.2**

**Resultat: GOLD** ⭐

---

## Pipedrive-integration

### Fält som används

| Data | Pipedrive-fält | Typ |
|------|----------------|-----|
| Roll | Functions | Person (flerval) |
| Relationsstyrka | Relationship Strength | Person (enval) |
| Aktiviteter | Beräknas automatiskt | - |
| Omsättning | Omsättning | Organisation |
| CAGR | CAGR 3Y | Organisation |
| Bransch | Bransch SE | Organisation |
| Avstånd | Avstånd GBG | Organisation (km) |
| Extern score | Score | Organisation |

### Uppdaterade fält

| Fält | Beskrivning |
|------|-------------|
| Lead Tier | Gold / Silver / Bronze |
| Lead Score | Numerisk poäng (0-100) |

---

## Automation

Scoring kan triggas automatiskt i Pipedrive via webhook när:

1. En person skapas
2. En person uppdateras
3. En aktivitet registreras
4. En organisation kopplas till personen

### API-anrop

```
POST https://scoring-api-seven.vercel.app/api/score/pipedrive
Headers:
  Content-Type: application/json
  x-api-key: [din-api-nyckel]
Body:
  { "person_id": 12345 }
```

---

## Konfiguration

Alla vikter, trösklar och poängskalor kan justeras i `src/lib/scoring/config.ts`.

### Justera tier-trösklar

```typescript
tiers: {
  gold: 70,    // Ändra till önskat värde
  silver: 40   // Ändra till önskat värde
}
```

### Justera vikter

```typescript
weights: {
  person: 0.6,   // Person-vikt (summa = 1.0)
  company: 0.4   // Företags-vikt
}
```

---

## Rekommendationer för användning

1. **Fokusera på GOLD-leads** - Dessa har både rätt roll och rätt företagsprofil
2. **Nurture SILVER-leads** - Bygg relation och engagemang för att höja scoren
3. **Kvalificera BRONZE** - Undersök om det finns potential eller om de bör prioriteras ned
4. **Uppdatera regelbundet** - Kör scoring efter viktiga interaktioner
5. **Anpassa vikter** - Justera baserat på vad som faktiskt konverterar för er

---

## Teknisk dokumentation

Se [CLAUDE.md](./CLAUDE.md) för teknisk information om API:et och utveckling.
