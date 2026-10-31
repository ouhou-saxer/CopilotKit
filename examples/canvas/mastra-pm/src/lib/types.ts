import { z } from "zod";

/** Business areas of SaXer Verwaltungen (Yves) and SaXer Immobilien (Sascha). */
export const AREAS = [
  "vermietung",
  "bewirtschaftung",
  "finanzen",
  "personal",
  "it",
  "bewertung",
  "verkauf",
  "networking",
  "marketing",
] as const;

export const AreaSchema = z.enum(AREAS);
export type Area = z.infer<typeof AreaSchema>;

export type Company = "verwaltungen" | "immobilien" | "gemeinsam";

/** Display label, owning company and default owner (user id) per area. */
export const AREA_INFO: Record<
  Area,
  { label: string; company: Company; defaultOwner: number }
> = {
  vermietung: { label: "Vermietung", company: "verwaltungen", defaultOwner: 1 },
  bewirtschaftung: {
    label: "Bewirtschaftung",
    company: "verwaltungen",
    defaultOwner: 1,
  },
  finanzen: { label: "Finanzen", company: "verwaltungen", defaultOwner: 1 },
  personal: { label: "Personal", company: "verwaltungen", defaultOwner: 1 },
  it: {
    label: "IT & Digitalisierung",
    company: "verwaltungen",
    defaultOwner: 1,
  },
  bewertung: { label: "Bewertung", company: "immobilien", defaultOwner: 2 },
  verkauf: { label: "Verkauf", company: "immobilien", defaultOwner: 2 },
  networking: { label: "Networking", company: "immobilien", defaultOwner: 2 },
  marketing: { label: "Marketing", company: "gemeinsam", defaultOwner: 2 },
};

export const UserSchema = z.object({
  id: z.number(),
  role: z.string(),
  name: z.string(),
  email: z.string(),
  summary: z.string(),
  image: z.string(),
});

export const TaskSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  status: z.enum(["todo", "in-progress", "done"]),
  assignedTo: z.number(),
  area: AreaSchema,
});

export const users: z.infer<typeof UserSchema>[] = [
  {
    id: 1,
    role: "SaXer Verwaltungen",
    name: "Yves",
    email: "",
    summary:
      "Yves leitet SaXer Verwaltungen und verantwortet Vermietung, Bewirtschaftung, Finanzen, Personal und IT.",
    image: "",
  },
  {
    id: 2,
    role: "SaXer Immobilien",
    name: "Sascha",
    email: "",
    summary:
      "Sascha leitet SaXer Immobilien und verantwortet Bewertung, Verkauf und Networking.",
    image: "",
  },
];

export const tasks: z.infer<typeof TaskSchema>[] = [
  {
    id: 1,
    name: "Inserat 3½-Zimmer-Wohnung Thun-Dürrenast",
    description:
      "Fotos, Grundriss und Inseratetext aufbereiten und auf den Portalen aufschalten.",
    status: "in-progress",
    assignedTo: 1,
    area: "vermietung",
  },
  {
    id: 2,
    name: "Heiz- und Nebenkostenabrechnung 2025/26",
    description:
      "Zählerstände und Rechnungen erfassen, Abrechnung erstellen und versenden.",
    status: "todo",
    assignedTo: 1,
    area: "finanzen",
  },
  {
    id: 3,
    name: "Digitale Wohnungsabnahme einführen",
    description:
      "Tablet-Lösung für Abnahme- und Übergabeprotokolle testen und Ablauf festlegen.",
    status: "todo",
    assignedTo: 1,
    area: "it",
  },
  {
    id: 4,
    name: "Marktwertschätzung Einfamilienhaus Steffisburg",
    description:
      "Besichtigung durchführen, Vergleichswerte auswerten und Bewertungsbericht erstellen.",
    status: "in-progress",
    assignedTo: 2,
    area: "bewertung",
  },
  {
    id: 5,
    name: "Verkaufsdokumentation Eigentumswohnung Hilterfingen",
    description:
      "Unterlagen sammeln, Dokumentation gestalten und Vermarktungsplan festlegen.",
    status: "todo",
    assignedTo: 2,
    area: "verkauf",
  },
  {
    id: 6,
    name: "Kontaktpflege Notariate und Banken Region Thun",
    description:
      "Termine mit den wichtigsten Partnern vereinbaren und Empfehlungen nachfassen.",
    status: "done",
    assignedTo: 2,
    area: "networking",
  },
];
