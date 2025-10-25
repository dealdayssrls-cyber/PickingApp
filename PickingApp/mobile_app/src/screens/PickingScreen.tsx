import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Button, Alert, TextInput, ScrollView, Modal, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Prodotto, ScanResult, Ordine } from '../types';

import { syncManager } from '../services/SyncManager';

interface PickingScreenProps {
  route?: any;
  navigation?: any;
}

export default function PickingScreen({ route, navigation }: PickingScreenProps) {
  const { ordine: ordineIniziale, operatore } = route.params || {};
  
  // Stati per lo scanner
  const [scannerVisible, setScannerVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedData, setScannedData] = useState<string>('');
  const [scannedProduct, setScannedProduct] = useState<Prodotto | { loading: boolean } | null>(null);

  // Ordine corrente
  const [ordineCorrente, setOrdineCorrente] = useState<Ordine>(ordineIniziale || {
    id: 'vuoto',
    nome: 'Nessun ordine selezionato',
    prodotti: [],
    operatore: operatore || 'Operatore',
    dataCreazione: new Date().toISOString().split('T')[0],
    stato: 'in_lavorazione',
    totale: 0,
    prodottiCount: 0,
    quantitaTotaleOrdinata: 0,
    quantitaTotalePrelevata: 0
  });

  // Stati per modifiche manuali
  const [modalQuantitaVisible, setModalQuantitaVisible] = useState(false);
  const [prodottoDaModificare, setProdottoDaModificare] = useState<Prodotto | null>(null);
  const [nuovaQuantita, setNuovaQuantita] = useState('');
  const [modalCodiceManualeVisible, setModalCodiceManualeVisible] = useState(false);
  const [codiceManuale, setCodiceManuale] = useState('');
  const [modalRinominaVisible, setModalRinominaVisible] = useState(false);
  const [nuovoNomeOrdine, setNuovoNomeOrdine] = useState('');

  // Stati connessione
  const [ipAddress, setIpAddress] = useState('192.168.1.67');

  // === FUNZIONE PER SALVARE L'ORDINE CORRENTE ===
  const salvaOrdineCorrente = async () => {
    try {
      const ORDINI_STORAGE_KEY = 'ordini_in_lavorazione';
      const ordiniSalvati = await AsyncStorage.getItem(ORDINI_STORAGE_KEY);
      
      let ordiniAggiornati: Ordine[] = [];
      
      if (ordiniSalvati) {
        const ordini = JSON.parse(ordiniSalvati);
        
        // Trova e aggiorna l'ordine corrente
        const index = ordini.findIndex((ordine: Ordine) => ordine.id === ordineCorrente.id);
        
        if (index !== -1) {
          // Aggiorna ordine esistente
          ordini[index] = ordineCorrente;
          ordiniAggiornati = ordini;
        } else {
          // Aggiungi nuovo ordine
          ordiniAggiornati = [ordineCorrente, ...ordini];
        }
      } else {
        // Se non ci sono ordini salvati, crea un nuovo array
        ordiniAggiornati = [ordineCorrente];
      }
      
      await AsyncStorage.setItem(ORDINI_STORAGE_KEY, JSON.stringify(ordiniAggiornati));
      console.log('💾 Ordine salvato automaticamente:', ordineCorrente.nome);
      
    } catch (error) {
      console.error('❌ Errore salvataggio automatico:', error);
      // 🔥 IMPORTANTE: Ritenta il salvataggio dopo 1 secondo
      setTimeout(() => {
        salvaOrdineCorrente();
      }, 1000);
    }
  };

  // === SALVATAGGIO AUTOMATICO ALL'USCITA ===
  useEffect(() => {
    return () => {
      // Salvataggio FORZATO all'uscita
      console.log('💾 Salvataggio FORZATO ordine all\'uscita...');
      salvaOrdineCorrente().catch(error => {
        console.error('❌ Errore salvataggio forzato:', error);
        // Ultimo tentativo dopo 2 secondi
        setTimeout(salvaOrdineCorrente, 2000);
      });
    };
  }, []); 

  // === SALVATAGGIO AUTOMATICO OGNI VOLTA CHE L'ORDINE CAMBIA ===
  useEffect(() => {
    if (ordineCorrente.id !== 'vuoto') {
      console.log('🔄 Ordine modificato, salvataggio in corso...');
      salvaOrdineCorrente();
    }
  }, [ordineCorrente]); // Si esegue ogni volta che ordineCorrente cambia

    // FUNZIONE PER COMPLETARE L'ORDINE E SINCRONIZZARE
    const completaOrdine = () => {
          // Verifica che ci siano prodotti prelevati
          if (ordineCorrente.quantitaTotalePrelevata === 0) {
              Alert.alert('⚠️ Attenzione', 'Non hai prelevato nessun prodotto per questo ordine.');
              return;
          }

          Alert.alert(
              '✅ Completa Ordine',
              `Sei sicuro di voler completare l'ordine "${ordineCorrente.nome}"?\n\n` +
              `📦 Prodotti prelevati: ${ordineCorrente.quantitaTotalePrelevata}\n\n` +
              `⚠️ ATTENZIONE:\n` +
              `• L'ordine verrà sincronizzato con il server\n` +
              `• Il file ordine verrà spostato nella cartella "ordini_completati"\n` +
              `• Non sarà più possibile modificare l'ordine\n\n` +
              `Confermi di voler procedere?`,
              [
                  {
                      text: '❌ Annulla',
                      style: 'cancel',
                      onPress: () => console.log('Completamento ordine annullato')
                  },
                  {
                      text: '✅ Sì, Completa e Sincronizza',
                      style: 'destructive',
                      onPress: async () => {
                          try {
                              // Mostra indicatore di caricamento
                              Alert.alert('🔄 Sincronizzazione', 'Invio ordine completato al server...');

                              // 1. Aggiorna stato ordine a "completato"
                              const ordineCompletato = {
                                  ...ordineCorrente,
                                  stato: 'completato' as const,
                                  dataCompletamento: new Date().toISOString().split('T')[0]
                              };

                              // 2. Salva localmente
                              const ORDINI_STORAGE_KEY = 'ordini_in_lavorazione';
                              const ordiniSalvati = await AsyncStorage.getItem(ORDINI_STORAGE_KEY);
                              
                              if (ordiniSalvati) {
                                  const ordini = JSON.parse(ordiniSalvati);
                                  const ordiniAggiornati = ordini.map((ordine: Ordine) => 
                                      ordine.id === ordineCorrente.id ? ordineCompletato : ordine
                                  );
                                  await AsyncStorage.setItem(ORDINI_STORAGE_KEY, JSON.stringify(ordiniAggiornati));
                              }

                              // 3. SINCRONIZZA CON IL SERVER
                              console.log('🔄 Invio ordine al server...');
                              const result = await syncManager.syncOrderCompletion(ordineCompletato);
                              
                              if (result.success) {
                                  let message = `Ordine "${ordineCorrente.nome}" sincronizzato con successo!\n\n` +
                                              `Prodotti prelevati: ${ordineCorrente.quantitaTotalePrelevata}`;
                                  
                                  if (result.ordine_spostato) {
                                      message += `\n\n📁 File ordine spostato in "ordini_completati"`;
                                  }
                                  
                                  Alert.alert(
                                      '✅ Ordine Completato!',
                                      message,
                                      [
                                          {
                                              text: 'OK',
                                              onPress: () => navigation.navigate('Orders', { operatore })
                                          }
                                      ]
                                  );
                              } else {
                                  Alert.alert(
                                      '⚠️ Ordine Salvato in Locale',
                                      `Ordine completato ma sincronizzazione fallita: ${result.message}\n\n` +
                                      `L'ordine verrà sincronizzato automaticamente appena possibile.`,
                                      [
                                          {
                                              text: 'OK',
                                              onPress: () => navigation.navigate('Orders', { operatore })
                                          }
                                      ]
                                  );
                              }

                          } catch (error: any) {
                              console.error('❌ Errore completamento ordine:', error);
                              Alert.alert(
                                  '❌ Errore', 
                                  `Impossibile completare l'ordine: ${error.message}\n\nL'ordine rimane in lavorazione.`,
                                  [
                                      {
                                          text: 'OK',
                                          onPress: () => console.log('Errore gestito')
                                      }
                                  ]
                              );
                          }
                      }
                  }
              ]
          );
      };

  // FUNZIONE PER DETERMINARE IL COLORE DEL PRODOTTO
  const getProdottoColor = (prodotto: Prodotto) => {
    const quantitaOrdinata = prodotto.quantitaOrdinata || 0;
    const quantitaPrelevata = prodotto.quantitaPrelevata || 0;

    // Prodotto extra (non nell'ordine originale)
    if (quantitaOrdinata === 0) {
      return '#9b59b6'; // Viola per prodotti extra
    }
    
    // Prodotto SUPERIORE all'ordinato (verde scuro)
    if (quantitaPrelevata > quantitaOrdinata) {
      return '#0e5e4eff'; // Verde scuro per superiore
    }
    
    // Prodotto completato
    if (quantitaPrelevata >= quantitaOrdinata) {
      return '#27ae60'; // Verde per completato
    }
    
    // Prodotto in corso (parziale)
    if (quantitaPrelevata > 0 && quantitaPrelevata < quantitaOrdinata) {
      return '#f39c12'; // Arancione per parziale
    }
    
    // Prodotto non iniziato
    return '#e74c3c'; // Rosso per non iniziato
  };

    // FUNZIONE PER DETERMINARE LO STATO DEL PRODOTTO
  const getProdottoStato = (prodotto: Prodotto) => {
    const quantitaOrdinata = prodotto.quantitaOrdinata || 0;
    const quantitaPrelevata = prodotto.quantitaPrelevata || 0;

    if (quantitaOrdinata === 0) {
      return '🟣 EXTRA';
    }
    if (quantitaPrelevata > quantitaOrdinata) {
      return '🟢 SUPERIORE';
    }
    if (quantitaPrelevata >= quantitaOrdinata) {
      return '✅ COMPLETATO';
    }
    if (quantitaPrelevata > 0) {
      return '🟡 IN CORSO';
    }
    return '🔴 DA INIZIARE';
  };

  // NUOVA FUNZIONE PER VERIFICARE SE È UN PRODOTTO EXTRA
  const isProdottoExtra = (prodotto: Prodotto): boolean => {
    return (prodotto.quantitaOrdinata || 0) === 0;
  };

  // FUNZIONE PER ELIMINARE PRODOTTO
    const eliminaProdotto = (prodotto: Prodotto) => {
      const isExtra = isProdottoExtra(prodotto);
      
      Alert.alert(
        isExtra ? 'Elimina Prodotto Extra' : 'Rimuovi Prodotto',
        `Sei sicuro di voler ${isExtra ? 'eliminare' : 'rimuovere'} "${prodotto.descrizione}" ${isExtra ? 'dall\'ordine' : 'dai prodotti prelevati'}?`,
        [
          {
            text: 'Annulla',
            style: 'cancel'
          },
          {
            text: isExtra ? 'Elimina' : 'Rimuovi',
            style: 'destructive',
            onPress: () => {
              const nuovoOrdine = { ...ordineCorrente };
              const index = nuovoOrdine.prodotti.findIndex(p => p.codice === prodotto.codice);
              
              if (index !== -1) {
                // Sottrai la quantità prelevata dal totale
                nuovoOrdine.quantitaTotalePrelevata -= (prodotto.quantitaPrelevata || 0);
                // Rimuovi il prodotto
                nuovoOrdine.prodotti.splice(index, 1);
                nuovoOrdine.prodottiCount = nuovoOrdine.prodotti.length;
                
                setOrdineCorrente(nuovoOrdine);
                Alert.alert(
                  '✅ Successo', 
                  isExtra ? 'Prodotto extra eliminato' : 'Prodotto rimosso dai prelevati'
                );
              }
            }
          }
        ]
      );
  };



  // FUNZIONE PER ABBANDONARE L'ORDINE
  const abbandonaOrdine = () => {
    // 🔥 SALVATAGGIO IMMEDIATO prima di qualsiasi azione
    salvaOrdineCorrente().then(() => {
      // ... resto del codice abbandonaOrdine
      if (ordineCorrente.fileName) {
        Alert.alert(
          '❌ Abbandona Ordine',
          `Sei sicuro di voler abbandonare l'ordine "${ordineCorrente.nome}"?\n\nL'ordine tornerà disponibile nella sezione "Ordini da File" e tutti i progressi verranno persi.`,
          [
            {
              text: 'Annulla',
              style: 'cancel'
            },
            {
              text: 'Sì, Abbandona',
              style: 'destructive',
              onPress: async () => {
                try {
                  // Rimuovi l'ordine dalla lista degli ordini in lavorazione
                  const ORDINI_STORAGE_KEY = 'ordini_in_lavorazione';
                  const ordiniSalvati = await AsyncStorage.getItem(ORDINI_STORAGE_KEY);
                  
                  if (ordiniSalvati) {
                    const ordini = JSON.parse(ordiniSalvati);
                    const ordiniAggiornati = ordini.filter((ordine: Ordine) => ordine.id !== ordineCorrente.id);
                    await AsyncStorage.setItem(ORDINI_STORAGE_KEY, JSON.stringify(ordiniAggiornati));
                    console.log('✅ Ordine abbandonato e rimosso dalla lista');
                  }
                  
                  // Torna alla schermata precedente
                  navigation.goBack();
                  
                } catch (error) {
                  console.error('❌ Errore durante l\'abbandono dell\'ordine:', error);
                  Alert.alert('Errore', 'Impossibile abbandonare l\'ordine');
                }
              }
            }
          ]
        );
      } else {
        // ... resto del codice per ordini nuovi
      }
    });
  };

// FUNZIONE PER RINOMINARE L'ORDINE
  const apriRinominaOrdine = () => {
    setNuovoNomeOrdine(ordineCorrente.nome);
    setModalRinominaVisible(true);
  };

  const confermaRinominaOrdine = async () => {
    if (!nuovoNomeOrdine.trim()) {
      Alert.alert('Attenzione', 'Inserisci un nome per l\'ordine');
      return;
    }

    if (nuovoNomeOrdine === ordineCorrente.nome) {
      setModalRinominaVisible(false);
      return;
    }

    try {
      const ordineRinominato = {
        ...ordineCorrente,
        nome: nuovoNomeOrdine.trim()
      };

      // Aggiorna l'ordine corrente
      setOrdineCorrente(ordineRinominato);

      // Aggiorna anche nello storage
      const ORDINI_STORAGE_KEY = 'ordini_in_lavorazione';
      const ordiniSalvati = await AsyncStorage.getItem(ORDINI_STORAGE_KEY);
      
      if (ordiniSalvati) {
        const ordini = JSON.parse(ordiniSalvati);
        const ordiniAggiornati = ordini.map((ordine: Ordine) => 
          ordine.id === ordineCorrente.id ? ordineRinominato : ordine
        );
        await AsyncStorage.setItem(ORDINI_STORAGE_KEY, JSON.stringify(ordiniAggiornati));
      }

      setModalRinominaVisible(false);
      Alert.alert('✅ Successo', 'Ordine rinominato con successo');
      
    } catch (error) {
      console.error('❌ Errore durante la rinomina:', error);
      Alert.alert('Errore', 'Impossibile rinominare l\'ordine');
    }
  };

    // FUNZIONE PER CERCARE PRODOTTO NELL'INVENTARIO
    const cercaProdotto = async (codice: string): Promise<Prodotto | null> => {
        try {
            console.log(`🔍 Cercando prodotto con codice: ${codice}`);
            
            const response = await axios.get(`http://${ipAddress}:3001/api/sync/inventory`, {
                timeout: 5000
            });

            if (!response.data.success) {
                Alert.alert('❌ Errore', 'Impossibile accedere all\'inventario');
                return null;
            }

            const inventario = response.data.data;
            const codiceClean = codice.toString().trim().toUpperCase();

            const prodottoTrovato = inventario.find((prodotto: any) => {
                const codProdotto = (prodotto['Cod.'] || prodotto.Cod || '').toString().trim().toUpperCase();
                if (codProdotto === codiceClean) {
                    return true;
                }

                let eanArray: string[] = [];
                if (Array.isArray(prodotto['Cod. a barre'])) {
                    eanArray = prodotto['Cod. a barre'];
                } else if (prodotto['Cod. a barre']) {
                    eanArray = [prodotto['Cod. a barre']];
                }

                return eanArray.some(ean => 
                    ean && ean.toString().trim().toUpperCase() === codiceClean
                );
            });

            if (prodottoTrovato) {
                console.log('✅ Prodotto trovato:', prodottoTrovato);
                
                // CONTROLLA SE IL PRODOTTO È NELL'ORDINE
                const prodottoInOrdine = ordineCorrente.prodotti.find(p => 
                    p.codice === (prodottoTrovato['Cod.'] || prodottoTrovato.Cod || codiceClean).toString().trim()
                );
                
                if (prodottoInOrdine && (prodottoInOrdine.quantitaOrdinata || 0) > 0) {
                    // Prodotto trovato E presente nell'ordine
                    return {
                        codice: (prodottoTrovato['Cod.'] || prodottoTrovato.Cod || codiceClean).toString().trim(),
                        descrizione: prodottoTrovato.Descrizione || prodottoTrovato['Desc.'] || 'Descrizione non disponibile',
                        prezzo: prodottoTrovato['Listino 1 (ivato)'] ? `${prodottoTrovato['Listino 1 (ivato)']}€` : 'Prezzo non disponibile',
                        quantita: prodottoTrovato['Q.tà disponibile'] || 0,
                        codiceOriginale: prodottoTrovato['Cod.'] || prodottoTrovato.Cod,
                        quantitaOrdinata: prodottoInOrdine.quantitaOrdinata || 0,
                        quantitaPrelevata: prodottoInOrdine.quantitaPrelevata || 0
                    };
                } else {
                    // Prodotto trovato ma NON presente nell'ordine
                    console.log('⚠️ Prodotto NON presente nell\'ordine');
                    return {
                        codice: (prodottoTrovato['Cod.'] || prodottoTrovato.Cod || codiceClean).toString().trim(),
                        descrizione: prodottoTrovato.Descrizione || prodottoTrovato['Desc.'] || 'Descrizione non disponibile',
                        prezzo: prodottoTrovato['Listino 1 (ivato)'] ? `${prodottoTrovato['Listino 1 (ivato)']}€` : 'Prezzo non disponibile',
                        quantita: prodottoTrovato['Q.tà disponibile'] || 0,
                        codiceOriginale: prodottoTrovato['Cod.'] || prodottoTrovato.Cod,
                        quantitaOrdinata: 0, // Non presente nell'ordine
                        quantitaPrelevata: 0
                    };
                }
            } else {
                console.log('❌ Prodotto non trovato nell\'inventario');
                return null;
            }

        } catch (error: any) {
            console.log('❌ Errore nella ricerca:', error.message);
            
            // MOSTRA UN MESSAGGIO PIÙ CHIARO
            if (error.code === 'ECONNREFUSED' || error.message.includes('Network Error')) {
                Alert.alert(
                    '❌ Server Non Raggiungibile',
                    `Impossibile connettersi al server desktop.\n\n` +
                    `Verifica che:\n` +
                    `• Il computer desktop sia acceso\n` +
                    `• Il server sia in esecuzione\n` +
                    `• Siano sulla stessa rete WiFi\n` +
                    `• Il firewall permetta la connessione\n\n` +
                    `IP configurato: ${ipAddress}:3001`
                );
            } else {
                Alert.alert('❌ Errore', `Errore durante la ricerca: ${error.message}`);
            }
            return null;
        }
    };

  // FUNZIONE PER AGGIUNGERE PRODOTTO PRELEVATO ALL'ORDINE
  const aggiungiProdottoPrelevato = (prodotto: Prodotto, quantita: number = 1) => {
    const nuovoOrdine = { ...ordineCorrente };
    const prodottoEsistente = nuovoOrdine.prodotti.find(p => p.codice === prodotto.codice);
    
    if (prodottoEsistente) {
      prodottoEsistente.quantitaPrelevata = (prodottoEsistente.quantitaPrelevata || 0) + quantita;
      nuovoOrdine.quantitaTotalePrelevata += quantita;
    } else {
      const nuovoProdotto: Prodotto = {
        ...prodotto,
        quantitaOrdinata: 0,
        quantitaPrelevata: quantita
      };
      nuovoOrdine.prodotti.push(nuovoProdotto);
      nuovoOrdine.prodottiCount += 1;
      nuovoOrdine.quantitaTotalePrelevata += quantita;
    }
    
    setOrdineCorrente(nuovoOrdine);
    
    Alert.alert(
      '✅ Prodotto Registrato',
      `${prodotto.descrizione}\nQuantità prelevata: ${quantita}`,
      [{ text: 'OK' }]
    );
  };

  // FUNZIONE PER MODIFICARE QUANTITÀ PRELEVATA
  const modificaQuantitaPrelevata = (codice: string, nuovaQuantita: number) => {
    const nuovoOrdine = { ...ordineCorrente };
    const prodotto = nuovoOrdine.prodotti.find(p => p.codice === codice);
    
    if (prodotto) {
      const quantitaVecchia = prodotto.quantitaPrelevata || 0;
      prodotto.quantitaPrelevata = Math.max(0, nuovaQuantita);
      nuovoOrdine.quantitaTotalePrelevata += ((prodotto.quantitaPrelevata || 0) - quantitaVecchia);
      setOrdineCorrente(nuovoOrdine);
    }
  };

  // Calcola progresso ordine
  const calcolaProgresso = () => {
    if (ordineCorrente.quantitaTotaleOrdinata === 0) return 0;
    return (ordineCorrente.quantitaTotalePrelevata / ordineCorrente.quantitaTotaleOrdinata) * 100;
  };

  // FUNZIONE PRINCIPALE SCANNER
  const apriScanner = async () => {
    if (!permission) {
      await requestPermission();
    }

    if (!permission?.granted) {
      Alert.alert(
        'Permesso Fotocamera Richiesto',
        'Per scansionare i codici EAN è necessario accedere alla fotocamera.',
        [
          { text: 'OK', onPress: () => requestPermission() },
          { text: 'Annulla', style: 'cancel' }
        ]
      );
      return;
    }

    setScannerVisible(true);
    setScannedData('');
    setScannedProduct(null);
  };

  // FUNZIONE CHE GESTISCE LA SCANSIONE
  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    console.log('📷 Codice scansionato:', data);
    setScannedData(data);
    
    setScannedProduct({ loading: true });
    
    const prodotto = await cercaProdotto(data);
    setScannedProduct(prodotto);
    
    // Se prodotto non trovato nell'inventario, mostra alert immediatamente
    if (!prodotto) {
      Alert.alert(
        '❌ CODICE NON IN DATABASE',
        `Codice: ${data}\n\nFAI UNA FOTO AL PRODOTTO E ALL'EAN\n\nIl codice non è presente nell'inventario.`,
        [
          { text: 'OK', style: 'default' }
        ]
      );
    }
    
    setTimeout(() => {
      setScannerVisible(false);
    }, 1000);
  }

  // FUNZIONE PER INSERIMENTO MANUALE CODICE
  const apriInserimentoManuale = () => {
    setModalCodiceManualeVisible(true);
    setCodiceManuale('');
    console.log('📝 Apertura inserimento codice manuale');
  };

  const cercaCodiceManuale = async () => {
    if (!codiceManuale.trim()) {
      Alert.alert('⚠️ Attenzione', 'Inserisci un codice prodotto');
      return;
    }

    console.log(`🔍 Ricerca manuale codice: ${codiceManuale}`);
    
    try {
      const prodotto = await cercaProdotto(codiceManuale.trim());
      
      if (prodotto) {
        setModalCodiceManualeVisible(false);
        
        // CONTROLLA SE IL PRODOTTO È NELL'ORDINE
        const prodottoInOrdine = ordineCorrente.prodotti.find(p => p.codice === prodotto.codice);
        
        if (prodottoInOrdine && (prodottoInOrdine.quantitaOrdinata || 0) > 0) {
          // PRODOTTO TROVATO E PRESENTE NELL'ORDINE
          Alert.alert(
            '✅ Prodotto Trovato!',
            `Codice: ${prodotto.codice}\nProdotto: ${prodotto.descrizione}\nPrezzo: ${prodotto.prezzo}\nDisponibile: ${prodotto.quantita}`,
            [
              { 
                text: 'Aggiungi 1 al Prelevato', 
                onPress: () => {
                  aggiungiProdottoPrelevato(prodotto, 1);
                }
              },
              { 
                text: 'Aggiungi Quantità', 
                onPress: () => {
                  apriModificaQuantita(prodotto, 1);
                }
              },
              { text: 'Annulla', style: 'cancel' }
            ]
          );
        } else {
          // PRODOTTO TROVATO MA NON PRESENTE NELL'ORDINE
          Alert.alert(
            '⚠️ PRODOTTO NON PRESENTE NELL\'ORDINE',
            `Codice: ${prodotto.codice}\nProdotto: ${prodotto.descrizione}\n\nQuesto prodotto non è nell'ordine corrente.`,
            [
              { 
                text: 'Aggiungi Come Extra', 
                onPress: () => {
                  aggiungiProdottoPrelevato(prodotto, 1);
                }
              },
              { text: 'Annulla', style: 'cancel' }
            ]
          );
        }
      } else {
        // PRODOTTO NON TROVATO NELL'INVENTARIO
        Alert.alert(
          '❌ CODICE NON IN DATABASE',
          `Codice: ${codiceManuale}\n\nFAI UNA FOTO AL PRODOTTO E ALL'EAN\n\nIl codice non è presente nell'inventario.`,
          [
            { text: 'OK', style: 'default' }
          ]
        );
      }
    } catch (error: any) {
      Alert.alert('❌ Errore', `Errore durante la ricerca: ${error.message}`);
    }
  };

  // FUNZIONE PER APRIRE MODIFICA QUANTITÀ
  const apriModificaQuantita = (prodotto: Prodotto, quantitaIniziale: number) => {
    setProdottoDaModificare(prodotto);
    setNuovaQuantita(quantitaIniziale.toString()); // Imposta il valore corrente
    setModalQuantitaVisible(true);
  };

  // FUNZIONE PER CONFERMA MODIFICA QUANTITÀ
  const confermaModificaQuantita = () => {
    const quantitaNum = parseInt(nuovaQuantita);
    
    if (isNaN(quantitaNum) || quantitaNum < 0) {
      Alert.alert('❌ Errore', 'Inserisci una quantità valida (numero positivo)');
      return;
    }

    if (!prodottoDaModificare) return;

    // MODIFICA QUI: Sostituisce la quantità invece di sommarla
    const nuovoOrdine = { ...ordineCorrente };
    const prodotto = nuovoOrdine.prodotti.find(p => p.codice === prodottoDaModificare.codice);
    
    if (prodotto) {
      const quantitaVecchia = prodotto.quantitaPrelevata || 0;
      prodotto.quantitaPrelevata = quantitaNum;
      
      // Aggiorna il totale generale
      nuovoOrdine.quantitaTotalePrelevata += (quantitaNum - quantitaVecchia);
      
      setOrdineCorrente(nuovoOrdine);
      
      Alert.alert(
        '✅ Quantità Aggiornata',
        `${prodottoDaModificare.descrizione}\nQuantità impostata a: ${quantitaNum}`
      );
    }

    setModalQuantitaVisible(false);
    setProdottoDaModificare(null);
    setNuovaQuantita('');
  };

    // EFFETTO PER MOSTRARE RISULTATO SCANSIONE
    useEffect(() => {
    if (scannedData && !scannerVisible && scannedProduct && !('loading' in scannedProduct)) {
      
      // CONTROLLA SE IL PRODOTTO È NELL'ORDINE
      const prodottoInOrdine = ordineCorrente.prodotti.find(p => p.codice === scannedProduct.codice);
      
      if (prodottoInOrdine && (prodottoInOrdine.quantitaOrdinata || 0) > 0) {
        // PRODOTTO TROVATO E PRESENTE NELL'ORDINE
        Alert.alert(
          '✅ Prodotto Trovato!',
          `Codice: ${scannedData}\nProdotto: ${scannedProduct.descrizione}\nPrezzo: ${scannedProduct.prezzo}\nDisponibile: ${scannedProduct.quantita}`,
          [
            { 
              text: 'Aggiungi 1 al Prelevato', 
              onPress: () => {
                aggiungiProdottoPrelevato(scannedProduct, 1);
              }
            },
            { 
              text: 'Aggiungi Quantità', 
              onPress: () => {
                apriModificaQuantita(scannedProduct, 1);
              }
            },
            { text: 'Annulla', style: 'cancel' }
          ]
        );
      } else {
        // PRODOTTO TROVATO MA NON PRESENTE NELL'ORDINE
        Alert.alert(
          '⚠️ PRODOTTO NON PRESENTE NELL\'ORDINE',
          `Codice: ${scannedData}\nProdotto: ${scannedProduct.descrizione}\n\nQuesto prodotto non è nell'ordine corrente.`,
          [
            { 
              text: 'Aggiungi Come Extra', 
              onPress: () => {
                aggiungiProdottoPrelevato(scannedProduct, 1);
              }
            },
            { text: 'Annulla', style: 'cancel' }
          ]
        );
      }
    }
  }, [scannedData, scannerVisible, scannedProduct]);

  return (
    <View style={styles.container}>
      {/* HEADER ORDINE - FISSO */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>📦 {ordineCorrente.nome}</Text>
          <TouchableOpacity 
            style={styles.rinominaButton}
            onPress={apriRinominaOrdine}
          >
            <Text style={styles.rinominaButtonText}>✏️</Text>
          </TouchableOpacity>
        </View>
        
        <Text style={styles.subtitle}>Operatore: {ordineCorrente.operatore}</Text>
        
        {/* PROGRESS BAR */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { width: `${calcolaProgresso()}%` }
              ]} 
            />
          </View>
          <Text style={styles.progressText}>
            {ordineCorrente.quantitaTotalePrelevata} / {ordineCorrente.quantitaTotaleOrdinata} 
            ({calcolaProgresso().toFixed(0)}%)
          </Text>
        </View>

        {/* PULSANTI AZIONE ORDINE */}
        <View style={styles.ordineActions}>
          <TouchableOpacity 
            style={styles.abbandonaButton}
            onPress={abbandonaOrdine}
          >
            <Text style={styles.abbandonaButtonText}>
              {ordineCorrente.fileName ? '❌ Abbandona Ordine' : '🗑️ Elimina Ordine'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* CONTROLLI PRINCIPALI - FISSI */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.scanButton} onPress={apriScanner}>
          <Text style={styles.scanButtonText}>📷 Scansiona EAN</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.manualButton} onPress={apriInserimentoManuale}>
          <Text style={styles.manualButtonText}>⌨️ Inserisci Codice</Text>
        </TouchableOpacity>
      </View>

      {/* LISTA PRODOTTI DELL'ORDINE - SCORREVOLE CON PADDING SICURO */}
      <ScrollView 
        style={styles.prodottiContainer}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.sectionTitle}>
          Prodotti Ordine ({ordineCorrente.prodottiCount})
        </Text>
        
        {ordineCorrente.prodotti.length === 0 ? (
          <Text style={styles.nessunProdotto}>
            Nessun prodotto nell'ordine. Inizia a scansionare!
          </Text>
        ) : (
          ordineCorrente.prodotti.map((prodotto: Prodotto, index: number) => {
            const uniqueKey = `${prodotto.codice}-${index}-${prodotto.quantitaPrelevata || 0}`;
            return (
              <View 
                key={uniqueKey}
                style={[
                  styles.prodottoCard,
                  { borderLeftColor: getProdottoColor(prodotto) }
                ]}
              >
                <View style={styles.prodottoHeader}>
                  <View style={styles.prodottoInfo}>
                    <Text style={styles.prodottoCodice}>{prodotto.codice}</Text>
                    <Text style={[styles.prodottoStato, { color: getProdottoColor(prodotto) }]}>
                      {getProdottoStato(prodotto)}
                    </Text>
                  </View>
                </View>
                
                <Text style={styles.prodottoDescrizione}>{prodotto.descrizione}</Text>
                
                <View style={styles.prodottoQuantita}>
                  <Text style={styles.quantitaOrdinataLabel}>
                    Ordinato: <Text style={styles.quantitaOrdinataValue}>{prodotto.quantitaOrdinata || 0}</Text>
                  </Text>
                  <Text style={styles.quantitaLabel}>
                    Prelevato: {prodotto.quantitaPrelevata || 0}
                  </Text>
                </View>
                
                <View style={styles.prodottoActions}>
                  {/* CESTINO VISIBILE SOLO PER PRODOTTI EXTRA */}
                  {isProdottoExtra(prodotto) && (
                    <TouchableOpacity
                      style={styles.eliminaBtn}
                      onPress={() => eliminaProdotto(prodotto)}
                    >
                      <Text style={styles.eliminaBtnText}>🗑️</Text>
                    </TouchableOpacity>
                  )}
                  
                  {/* SPAZIATORE PER MANTENERE L'ALLINEAMENTO QUANDO IL CESTINO NON C'È */}
                  {!isProdottoExtra(prodotto) && (
                    <View style={styles.eliminaBtn} />
                  )}
                  
                  <TouchableOpacity
                    style={styles.quantitaBtn}
                    onPress={() => modificaQuantitaPrelevata(prodotto.codice, (prodotto.quantitaPrelevata || 0) - 1)}
                  >
                    <Text style={styles.quantitaBtnText}>-</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.quantitaDisplay}
                    onPress={() => apriModificaQuantita(prodotto, prodotto.quantitaPrelevata || 0)}
                  >
                    <Text style={styles.quantitaText}>{prodotto.quantitaPrelevata || 0}</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.quantitaBtn}
                    onPress={() => modificaQuantitaPrelevata(prodotto.codice, (prodotto.quantitaPrelevata || 0) + 1)}
                  >
                    <Text style={styles.quantitaBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* 🔥 NUOVO PULSANTE COMPLETA ORDINE */}
      <TouchableOpacity 
        style={[
          styles.completeOrderButton,
          ordineCorrente.quantitaTotalePrelevata === 0 && styles.completeOrderButtonDisabled
        ]}
        onPress={completaOrdine}
        disabled={ordineCorrente.quantitaTotalePrelevata === 0}
      >
        <Text style={styles.completeOrderButtonText}>
          ✅ Completa Ordine
        </Text>
      </TouchableOpacity>

      {/* MODAL SCANNER */}
      <Modal visible={scannerVisible} animationType="slide" statusBarTranslucent={true}>
        <View style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>📷 Scanner EAN</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setScannerVisible(false)}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={scannedData ? undefined : handleBarcodeScanned}
          />
          
          <View style={styles.scannerFooter}>
            <Text style={styles.scannerInstruction}>
              Inquadra il codice a barre del prodotto
            </Text>
            {scannedData && (
              <Text style={styles.scannedText}>
                Codice scansionato: {scannedData}
              </Text>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL INSERIMENTO CODICE MANUALE */}
      <Modal 
        visible={modalCodiceManualeVisible} 
        animationType="slide" 
        presentationStyle="pageSheet"
        transparent={false}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>⌨️ Inserisci Codice</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalCodiceManualeVisible(false)}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalContent}>
            <Text style={styles.modalLabel}>Codice prodotto o EAN:</Text>
            <TextInput
              style={styles.modalInput}
              value={codiceManuale}
              onChangeText={setCodiceManuale}
              placeholder="Inserisci codice..."
              autoFocus={true}
              onSubmitEditing={cercaCodiceManuale}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalCodiceManualeVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Annulla</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={cercaCodiceManuale}
              >
                <Text style={styles.confirmButtonText}>Cerca</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL MODIFICA QUANTITÀ MANUALE */}
      <Modal visible={modalQuantitaVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>📦 Modifica Quantità</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalQuantitaVisible(false)}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalContent}>
            {prodottoDaModificare && (
              <>
                <Text style={styles.modalLabel}>
                  {prodottoDaModificare.descrizione}
                </Text>
                <Text style={styles.modalSubLabel}>
                  Codice: {prodottoDaModificare.codice}
                </Text>
                
                <TextInput
                  style={styles.modalInput}
                  value={nuovaQuantita}
                  onChangeText={setNuovaQuantita}
                  placeholder="Quantità..."
                  keyboardType="numeric"
                  autoFocus={true}
                />
                
                {/* PULSANTI RAPIDI PER QUANTITÀ FREQUENTI */}
                <View style={styles.quantitaRapideContainer}>
                  <Text style={styles.quantitaRapideLabel}>Quantità frequenti:</Text>
                  <View style={styles.quantitaRapideGrid}>
                    {[6, 8, 9, 10, 12, 18, 20, 24, 27, 30, 36, 40, 48, 50, 60, 72, 78, 96, 100, 120].map((quantita) => (
                      <TouchableOpacity
                        key={quantita}
                        style={styles.quantitaRapidaBtn}
                        onPress={() => setNuovaQuantita(quantita.toString())}
                      >
                        <Text style={styles.quantitaRapidaText}>{quantita}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={() => setModalQuantitaVisible(false)}
                  >
                    <Text style={styles.cancelButtonText}>Annulla</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.modalButton, styles.confirmButton]}
                    onPress={confermaModificaQuantita}
                  >
                    <Text style={styles.confirmButtonText}>Conferma</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL RINOMINA ORDINE */}
      <Modal visible={modalRinominaVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>✏️ Rinomina Ordine</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalRinominaVisible(false)}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalContent}>
            <Text style={styles.modalLabel}>Nuovo nome dell'ordine:</Text>
            <TextInput
              style={styles.modalInput}
              value={nuovoNomeOrdine}
              onChangeText={setNuovoNomeOrdine}
              placeholder="Inserisci il nuovo nome..."
              autoFocus={true}
              onSubmitEditing={confermaRinominaOrdine}
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalRinominaVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Annulla</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={confermaRinominaOrdine}
              >
                <Text style={styles.confirmButtonText}>Rinomina</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

{/* CHIUSURA DEL COMPONENTE PRINCIPALE - CORRETTA */}
</View>
);
}


// ... (tutti gli stili rimangono invariati)
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#2c3e50',
    padding: 20,
    paddingTop: 50,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#bdc3c7',
    textAlign: 'center',
    marginTop: 5,
  },
  progressContainer: {
    marginTop: 15,
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 10,
    backgroundColor: '#34495e',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#27ae60',
    borderRadius: 5,
  },
  progressText: {
    color: 'white',
    fontSize: 12,
    marginTop: 5,
    fontWeight: 'bold',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  scanButton: {
    backgroundColor: '#2ecc71',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 150,
    alignItems: 'center',
  },
  manualButton: {
    backgroundColor: '#9b59b6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 150,
    alignItems: 'center',
  },
  scanButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  manualButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  prodottiContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 15,
    paddingBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#2c3e50',
  },
  nessunProdotto: {
    textAlign: 'center',
    color: '#7f8c8d',
    fontSize: 16,
    padding: 20,
  },
  prodottoCard: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    borderLeftWidth: 4,
  },
  prodottoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 5,
  },
  prodottoInfo: {
    flex: 1,
  },
  prodottoCodice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  prodottoStato: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 2,
  },
  prodottoDescrizione: {
    fontSize: 16,
    marginBottom: 10,
    color: '#34495e',
  },
  prodottoQuantita: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  quantitaOrdinataLabel: {
    fontSize: 14,
    color: '#2c3e50',
  },
  quantitaOrdinataValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#e67e22',
  },
  quantitaLabel: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  prodottoActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 15,
    position: 'relative',
  },
  eliminaBtn: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    padding: 8,
  },
  eliminaBtnText: {
    fontSize: 18,
  },
  quantitaBtn: {
    width: 35,
    height: 35,
    borderRadius: 17,
    backgroundColor: '#3498db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantitaBtnText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  quantitaDisplay: {
    minWidth: 50,
    padding: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 5,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#bdc3c7',
  },
  quantitaText: {
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Scanner Styles
  scannerContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  scannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  scannerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  camera: {
    flex: 1,
  },
  scannerFooter: {
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
  },
  scannerInstruction: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
  },
  scannedText: {
    color: '#2ecc71',
    fontSize: 14,
    marginTop: 10,
    fontWeight: 'bold',
  },

  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  modalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#2c3e50',
  },
  modalSubLabel: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#bdc3c7',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: '#f8f9fa',
  },

  // Stili per pulsanti rapidi quantità
  quantitaRapideContainer: {
    marginBottom: 20,
  },
  quantitaRapideLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 10,
  },
  quantitaRapideGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quantitaRapidaBtn: {
    backgroundColor: '#3498db',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 40,
    alignItems: 'center',
  },
  quantitaRapidaText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // Stili per i pulsanti Annulla/Conferma
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#e74c3c',
  },
  confirmButton: {
    backgroundColor: '#27ae60',
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Aggiungi questi stili all'oggetto styles
headerTop: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 5,
},
rinominaButton: {
  padding: 8,
  backgroundColor: 'rgba(255,255,255,0.2)',
  borderRadius: 20,
},
rinominaButtonText: {
  fontSize: 16,
  color: 'white',
},
ordineActions: {
  flexDirection: 'row',
  justifyContent: 'center',
  marginTop: 15,
},
abbandonaButton: {
  backgroundColor: '#e74c3c',
  paddingVertical: 10,
  paddingHorizontal: 20,
  borderRadius: 8,
  alignItems: 'center',
  minWidth: 150,
},
abbandonaButtonText: {
  color: 'white',
  fontSize: 14,
  fontWeight: 'bold',
},
completeOrderButton: {
  backgroundColor: '#27ae60',
  padding: 15,
  margin: 15,
  borderRadius: 8,
  alignItems: 'center',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.2,
  shadowRadius: 4,
  elevation: 3,
},
completeOrderButtonDisabled: {
  backgroundColor: '#bdc3c7',
  opacity: 0.6,
},
completeOrderButtonText: {
  color: 'white',
  fontSize: 18,
  fontWeight: 'bold',
},
});