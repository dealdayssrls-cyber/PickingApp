// Tipi per l'app Picking
export interface Prodotto {
  codice: string;
  descrizione: string;
  prezzo: string;
  quantita: number;
  codiceOriginale?: string;
  quantitaOrdinata?: number;
  quantitaPrelevata?: number;
  timestamp?: string;
}

export interface Ordine {
  id: string;
  nome: string;
  fileName?: string;
  prodotti: Prodotto[];
  operatore: string;
  dataCreazione: string;
  dataCompletamento?: string;
  stato: 'in_lavorazione' | 'completato' | 'annullato';
  totale: number;
  prodottiCount: number;
  quantitaTotaleOrdinata: number;
  quantitaTotalePrelevata: number;
}

export interface ServerInfo {
  timestamp: string;
  inventory_loaded: boolean;
  inventory_count: number;
  server: string;
  status: string;
  version: string;
}

export interface ScanResult {
  data: string;
  prodotto?: Prodotto;
  loading?: boolean;
}

// Tipi per la gestione file ordini
export interface OrderFile {
  name: string;
  path: string;
  size: number;
  modified: Date;
}