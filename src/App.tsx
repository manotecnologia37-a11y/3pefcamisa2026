import { useState, useEffect, FormEvent, ChangeEvent, MouseEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Users, Star, Plus, X, Phone, Check, AlertCircle, LogIn, LogOut, Settings, Download, Camera, Trash2, Edit2, ChevronLeft, ChevronRight } from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  setDoc, 
  doc, 
  deleteDoc, 
  updateDoc,
  query, 
  orderBy, 
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, signInWithGoogle } from './lib/firebase';
import { ADMIN_EMAILS } from './constants';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface JerseyRegistration {
  id: string; // Using number as ID
  name: string;
  number: string;
  size: 'P' | 'M' | 'G' | 'GG' | 'XG';
  quantity: number;
  userId: string;
  status: 'Pendente' | 'Pago' | 'Entregue';
  recipientType: 'Atleta' | 'Familia' | 'Amigo';
  recipientName?: string;
  responsibleName: string;
  jerseyId: string;
  jerseyName: string;
  createdAt: any;
}

interface SiteConfig {
  logoUrl: string;
  bannerUrl: string;
  heroTitle: string;
  heroSubtitle: string;
  seasonText: string;
  contactPhone: string;
  footerText: string;
  primaryColor: string;
  isOpen: boolean;
  siteName: string;
  siteNameHighlight: string;
  footerSlogan: string;
}

interface JerseyDesign {
  id: string;
  name: string;
  imageUrl: string;
  description?: string;
  order?: number;
  price?: string;
}

interface Sponsor {
  id: string;
  name: string;
  imageUrl?: string;
  order: number;
}

const DEFAULT_CONFIG: SiteConfig = {
  logoUrl: '',
  bannerUrl: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=2693&auto=format&fit=crop',
  heroTitle: 'O SEU MANTO ESTÁ AQUI',
  heroSubtitle: 'Junte-se à elite. Personalize sua camisa oficial com seu nome e número exclusivo antes que acabem.',
  seasonText: 'EDIÇÃO LIMITADA 2026',
  contactPhone: '(00) 00000-0000',
  footerText: 'A glória é conquistada nos detalhes. Reserva de uniformes oficiais 2024.',
  primaryColor: '#d4af37',
  isOpen: true,
  siteName: 'PELOTÃO',
  siteNameHighlight: 'ESPECIAL',
  footerSlogan: 'UNIDADE ACIMA DE TUDO'
};

const JERSEY_SIZES = ['P', 'M', 'G', 'GG', 'XG'];

export default function App() {
  const [registrations, setRegistrations] = useState<JerseyRegistration[]>([]);
  const [jerseys, setJerseys] = useState<JerseyDesign[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [editingRegistration, setEditingRegistration] = useState<JerseyRegistration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [siteConfig, setSiteConfig] = useState<SiteConfig>(DEFAULT_CONFIG);
  const [activeAdminTab, setActiveAdminTab] = useState<'design' | 'textos' | 'vitrine' | 'patrocinadores' | 'stats' | 'reservas'>('design');

  // Admin Config Form State
  const [configForm, setConfigForm] = useState<SiteConfig>(DEFAULT_CONFIG);

  // Form state
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [size, setSize] = useState<'P' | 'M' | 'G' | 'GG' | 'XG'>('M');
  const [quantity, setQuantity] = useState(1);
  const [recipientType, setRecipientType] = useState<'Atleta' | 'Familia' | 'Amigo'>('Atleta');
  const [recipientName, setRecipientName] = useState('');
  const [responsibleName, setResponsibleName] = useState('');
  const [selectedJerseyId, setSelectedJerseyId] = useState('');
  const [selectedJerseyName, setSelectedJerseyName] = useState('');

  // Jersey Showcase Admin State
  const [editingJersey, setEditingJersey] = useState<JerseyDesign | null>(null);
  const [jerseyForm, setJerseyForm] = useState<Omit<JerseyDesign, 'id'>>({
    name: '',
    imageUrl: '',
    description: '',
    order: 0,
    price: ''
  });

  // Sponsors Admin State
  const [editingSponsor, setEditingSponsor] = useState<Sponsor | null>(null);
  const [sponsorForm, setSponsorForm] = useState<Omit<Sponsor, 'id'>>({
    name: '',
    imageUrl: '',
    order: 0
  });

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAdmin(user ? ADMIN_EMAILS.includes(user.email || '') : false);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Listener (Registrations)
  useEffect(() => {
    const q = query(collection(db, 'registrations'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as JerseyRegistration[];
      setRegistrations(data);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'registrations');
    });

    return () => unsubscribe();
  }, []);

  // Config Listener
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'configs', 'main'), (snapshot) => {
      if (snapshot.exists()) {
        const data = { ...DEFAULT_CONFIG, ...snapshot.data() } as SiteConfig;
        setSiteConfig(data);
        setConfigForm(data);

        // Update Theme Color
        if (data.primaryColor) {
           document.documentElement.style.setProperty('--primary', data.primaryColor);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Jerseys Listener
  useEffect(() => {
    // Verificando se a coleção existe e removendo orderBy temporariamente para evitar erros de índice não criado
    const q = query(collection(db, 'jerseys')); 
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as JerseyDesign[];
      // Ordenação manual no cliente para evitar necessidade de índices compostos imediatos
      const sortedData = data.sort((a, b) => (a.order || 0) - (b.order || 0));
      setJerseys(sortedData);
    }, (err) => {
      console.error("Erro ao carregar vitrine:", err);
      // Não lançamos erro aqui para não travar o app se a coleção estiver vazia ou com problema de permissão temporário
    });

    return () => unsubscribe();
  }, []);

  // Sponsors Listener
  useEffect(() => {
    const q = query(collection(db, 'sponsors'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Sponsor[];
      const sortedData = data.sort((a, b) => (a.order || 0) - (b.order || 0));
      setSponsors(sortedData);
    }, (err) => {
      console.error("Erro ao carregar patrocinadores:", err);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error("Login attempt failed:", err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError("O login foi cancelado ou fechou inesperadamente. Verifique se o seu navegador não bloqueou o pop-up.");
      } else if (err.code === 'auth/unauthorized-domain') {
        setError("Este domínio não está autorizado no Firebase Console. Adicione '3pefcamisa2026.vercel.app' em Authentication > Settings > Authorized Domains.");
      } else if (err.code === 'auth/network-request-failed') {
        setError("Erro de rede ao tentar logar. Verifique sua conexão.");
      } else {
        setError(`Erro ao fazer login: ${err.message || "Tente novamente."}`);
      }
    }
  };

  const handleLogout = () => auth.signOut();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!siteConfig.isOpen && !isAdmin) {
      setError("As reservas estão fechadas no momento.");
      return;
    }

    if (!currentUser) {
      setError("Você precisa estar logado para fazer uma reserva.");
      return;
    }

    // Validation: Unique number (but allow original number if editing)
    if (registrations.some(r => r.number === number && (!editingRegistration || editingRegistration.id !== r.id))) {
      setError(`O número ${number} já foi escolhido por outra pessoa.`);
      return;
    }

    if (!name || !number || !selectedJerseyId) {
      setError("Por favor, preencha todos os campos, incluindo o modelo da camisa.");
      return;
    }

    try {
      if (editingRegistration) {
        // If number changed, we need to delete the old document and create a new one 
        // since the ID is the number in this implementation? 
        if (editingRegistration.number !== number) {
          await deleteDoc(doc(db, 'registrations', editingRegistration.number));
        }
        
        await setDoc(doc(db, 'registrations', number), {
          name,
          number,
          size,
          quantity,
          recipientType,
          recipientName: recipientType === 'Atleta' ? '' : recipientName,
          responsibleName,
          jerseyId: selectedJerseyId,
          jerseyName: selectedJerseyName,
          userId: editingRegistration.userId,
          status: editingRegistration.status || 'Pendente',
          createdAt: editingRegistration.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(doc(db, 'registrations', number), {
          name,
          number,
          size,
          quantity,
          recipientType,
          recipientName: recipientType === 'Atleta' ? '' : recipientName,
          responsibleName,
          jerseyId: selectedJerseyId,
          jerseyName: selectedJerseyName,
          userId: currentUser.uid,
          status: 'Pendente',
          createdAt: serverTimestamp()
        });
      }

      setIsModalOpen(false);
      setEditingRegistration(null);
      setName('');
      setNumber('');
      setSize('M');
      setQuantity(1);
      setRecipientType('Atleta');
      setRecipientName('');
      setResponsibleName('');
      setSelectedJerseyId('');
      setSelectedJerseyName('');
    } catch (err) {
      if (err instanceof Error && err.message.includes('permission-denied')) {
        setError("Erro de permissão ou número já reservado.");
      } else {
        handleFirestoreError(err, OperationType.WRITE, `registrations/${number}`);
      }
    }
  };

  const removeRegistration = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'registrations', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `registrations/${id}`);
    }
  };

  const startEditing = (reg: JerseyRegistration) => {
    setEditingRegistration(reg);
    setName(reg.name);
    setNumber(reg.number);
    setSize(reg.size);
    setQuantity(reg.quantity);
    setRecipientType(reg.recipientType || 'Atleta');
    setRecipientName(reg.recipientName || '');
    setResponsibleName(reg.responsibleName || '');
    setSelectedJerseyId(reg.jerseyId || '');
    setSelectedJerseyName(reg.jerseyName || '');
    setIsModalOpen(true);
  };

  const updateJerseyStatus = async (id: string, newStatus: JerseyRegistration['status']) => {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, 'registrations', id), { status: newStatus });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `registrations/${id}`);
    }
  };

  const [adminError, setAdminError] = useState<string | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>, type: 'logoUrl' | 'bannerUrl') => {
    setAdminError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Aumentado para 500KB. O Firestore suporta 1MB total por documento. 
    // Logo + Banner em Base64 podem chegar perto disso.
    if (file.size > 512000) {
      setAdminError(`A imagem é muito pesada (${(file.size/1024).toFixed(0)}KB). Por favor, use imagens menores que 500KB para garantir o salvamento.`);
      return;
    }

    const reader = new FileReader();
    reader.onloadstart = () => setIsLoading(true);
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setConfigForm(prev => ({ ...prev, [type]: base64String }));
      setIsLoading(false);
    };
    reader.onerror = () => {
      setAdminError("Erro ao ler o arquivo selecionado.");
      setIsLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveConfig = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setAdminError(null);
    try {
      await setDoc(doc(db, 'configs', 'main'), configForm);
      setIsAdminPanelOpen(false);
    } catch (err: any) {
      if (err.message?.includes('exceeded')) {
        setAdminError("Erro: As imagens enviadas são muito pesadas para o banco de dados. Tente usar arquivos menores.");
      } else {
        handleFirestoreError(err, OperationType.WRITE, 'configs/main');
      }
    }
  };

  const handleSaveJersey = async (e?: FormEvent | MouseEvent) => {
    if (e) e.preventDefault();
    if (!isAdmin) return;
    setAdminError(null);

    if (!jerseyForm.name || !jerseyForm.imageUrl) {
      setAdminError("Nome e Imagem são obrigatórios para a vitrine.");
      return;
    }

    setIsLoading(true);
    try {
      if (editingJersey) {
        await updateDoc(doc(db, 'jerseys', editingJersey.id), {
          ...jerseyForm,
          updatedAt: serverTimestamp()
        });
      } else {
        const newDocRef = doc(collection(db, 'jerseys'));
        await setDoc(newDocRef, {
          ...jerseyForm,
          createdAt: serverTimestamp()
        });
      }
      setEditingJersey(null);
      setJerseyForm({ name: '', imageUrl: '', description: '', order: jerseys.length + 1, price: '' });
    } catch (err: any) {
      console.error("Error saving jersey:", err);
      handleFirestoreError(err, OperationType.WRITE, 'jerseys');
    } finally {
      setIsLoading(false);
    }
  };

  const removeJersey = async (id: string) => {
    if (!isAdmin) return;
    setAdminError(null);
    setIsLoading(true);
    try {
      await deleteDoc(doc(db, 'jerseys', id));
    } catch (err: any) {
      console.error("Error removing jersey:", err);
      setAdminError("Erro ao remover camisa: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSponsor = async (e?: FormEvent | MouseEvent) => {
    if (e) e.preventDefault();
    if (!isAdmin) return;
    setAdminError(null);

    if (!sponsorForm.name) {
      setAdminError("O nome do patrocinador é obrigatório.");
      return;
    }

    setIsLoading(true);
    try {
      if (editingSponsor) {
        await updateDoc(doc(db, 'sponsors', editingSponsor.id), {
          ...sponsorForm,
          updatedAt: serverTimestamp()
        });
      } else {
        const newDocRef = doc(collection(db, 'sponsors'));
        await setDoc(newDocRef, {
          ...sponsorForm,
          createdAt: serverTimestamp()
        });
      }
      setEditingSponsor(null);
      setSponsorForm({ name: '', imageUrl: '', order: sponsors.length + 1 });
    } catch (err: any) {
      console.error("Error saving sponsor:", err);
      setAdminError("Erro ao salvar patrocinador: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const removeSponsor = async (id: string) => {
    if (!isAdmin) return;
    setAdminError(null);
    setIsLoading(true);
    try {
      await deleteDoc(doc(db, 'sponsors', id));
    } catch (err: any) {
      console.error("Error removing sponsor:", err);
      setAdminError("Erro ao remover patrocinador: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSponsorImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    setAdminError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 512000) {
      setAdminError(`A imagem é muito pesada (${(file.size/1024).toFixed(0)}KB). Use imagens menores que 500KB.`);
      return;
    }

    const reader = new FileReader();
    reader.onloadstart = () => setIsLoading(true);
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setSponsorForm(prev => ({ ...prev, imageUrl: base64String }));
      setIsLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleJerseyImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    setAdminError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 512000) {
      setAdminError(`A imagem é muito pesada (${(file.size/1024).toFixed(0)}KB). Use imagens menores que 500KB.`);
      return;
    }

    const reader = new FileReader();
    reader.onloadstart = () => setIsLoading(true);
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setJerseyForm(prev => ({ ...prev, imageUrl: base64String }));
      setIsLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const exportToCSV = () => {
    const headers = ['Nome da camisa', 'Modelo', 'Numero', 'Responsável', 'Para', 'Tamanho', 'Quantidade', 'Status', 'Usuario'];
    const rows = registrations.map(r => [
      `"${r.name}"`,
      `"${r.jerseyName || 'Padrão'}"`,
      `"${r.number}"`,
      `"${r.responsibleName}"`,
      `"${r.recipientType === 'Atleta' ? 'Para Mim' : (r.recipientName || (r.recipientType === 'Familia' ? 'Família' : r.recipientType))}"`,
      `"${r.size}"`,
      r.quantity,
      `"${r.status}"`,
      `"${r.userId}"`
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `reservas_camisas_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-primary selection:text-black">
<style>{`
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      {/* Header */}
      <header className="border-b border-[#1a3b32] bg-black/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-[#1a3b32] p-2 rounded-lg border border-primary/30 overflow-hidden">
              {siteConfig.logoUrl ? (
                <img 
                  src={siteConfig.logoUrl} 
                  alt="Logo" 
                  className="w-7 h-7 sm:w-10 sm:h-10 object-contain" 
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Trophy className="w-6 h-6 sm:w-10 sm:h-10 text-primary" />
              )}
            </div>
            <span className="font-bold text-base sm:text-xl tracking-tight uppercase italic whitespace-nowrap">
              {siteConfig.siteName || 'PELOTÃO'} <span className="text-primary">{siteConfig.siteNameHighlight || 'ESPECIAL'}</span>
            </span>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            {isAdmin && (
              <button
                onClick={() => setIsAdminPanelOpen(true)}
                className="flex items-center gap-1.5 sm:gap-2 bg-primary text-black px-3 sm:px-4 py-2 rounded-full transition-all text-[9px] sm:text-xs font-black hover:scale-105 active:scale-95 shadow-lg shadow-primary/20 uppercase italic"
              >
                <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden xs:inline">ADMIN</span>
              </button>
            )}
            <a 
              href={`https://wa.me/${(siteConfig.contactPhone || '').replace(/\D/g, '')}`}
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-1.5 sm:gap-2 text-[9px] sm:text-sm font-medium text-gray-400 hover:text-primary transition-colors"
            >
              <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Contato</span>
            </a>
            
            {currentUser ? (
              <div className="flex items-center gap-2 sm:gap-4">
                <div className="hidden xs:block text-right border-l border-white/10 pl-2 sm:pl-4">
                   <p className="text-[7px] sm:text-[9px] uppercase font-bold text-gray-500 tracking-widest leading-none mb-0.5 whitespace-nowrap">Atleta</p>
                   <p className="text-[10px] sm:text-xs font-bold truncate max-w-[70px] sm:max-w-none leading-none">{currentUser.displayName}</p>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-1.5 sm:p-2 hover:bg-white/5 rounded-full transition-colors text-gray-400 hover:text-white"
                  title="Sair"
                >
                  <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-1.5 sm:gap-2 bg-primary/10 hover:bg-primary/20 text-primary px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-primary/20 transition-all text-xs sm:text-sm font-bold shadow-sm"
              >
                <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden xs:inline">ENTRAR</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero / Banner */}
      <section className="relative h-[65vh] sm:h-[75vh] min-h-[500px] sm:min-h-[600px] flex items-center justify-center overflow-hidden pt-16 md:pt-20">
        <div className="absolute inset-0 bg-gradient-to-b from-[#1a3b32]/60 to-[#0a0a0a] z-10" />
        <div 
          className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 opacity-30 sm:opacity-40 grayscale"
          style={{ 
            backgroundImage: `url('${siteConfig.bannerUrl}')`,
            backgroundPosition: 'center 30%' 
          }}
        />
        
        <div className="relative z-20 text-center px-4 max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col items-center"
          >
            <span className="inline-block px-3 sm:px-4 py-1 sm:py-1.5 bg-[#1a3b32] text-primary text-[8px] sm:text-[10px] font-black tracking-[0.4em] uppercase rounded-full mb-4 sm:mb-6 border border-primary/30 shadow-xl shadow-black/50">
              {siteConfig.seasonText}
            </span>
            <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-[8rem] font-black mb-4 sm:mb-8 tracking-tight sm:tracking-tighter uppercase italic leading-[0.85] sm:leading-[0.8] drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
              {(siteConfig.heroTitle || '').split(' ').map((word, i) => (
                <span key={i} className={word === 'MANTO' || word === 'CAMISA' ? 'text-primary' : ''}>{word} </span>
              ))}
            </h1>
            <p className="text-gray-400 text-xs sm:text-lg md:text-xl font-medium max-w-[280px] xs:max-w-md sm:max-w-2xl md:max-w-3xl mx-auto mb-10 sm:mb-14 leading-relaxed opacity-80 italic uppercase tracking-widest">
              {siteConfig.heroSubtitle}
            </p>
            
            <button
               onClick={() => {
                 setNumber('');
                 setName('');
                 setRecipientName('');
                 setResponsibleName('');
                 currentUser ? setIsModalOpen(true) : handleLogin();
               }}
               disabled={!siteConfig.isOpen && !isAdmin}
               className={`${(siteConfig.isOpen || isAdmin) ? 'bg-primary hover:bg-primary/90 shadow-2xl hover:shadow-primary/20 hover:scale-105 active:scale-95' : 'bg-gray-800 text-gray-500 cursor-not-allowed'} px-6 py-4 sm:px-10 sm:py-6 rounded-2xl sm:rounded-3xl flex items-center gap-3 sm:gap-4 transition-all group z-30`}
            >
               {(siteConfig.isOpen || isAdmin) ? (
                 <>
                   <div className="bg-black/10 p-1.5 sm:p-2 rounded-lg sm:rounded-xl group-hover:bg-black/20 transition-colors">
                    <Plus className="w-5 h-5 sm:w-6 sm:h-6 text-black group-hover:rotate-90 transition-transform" />
                   </div>
                   <span className="text-black font-black text-sm sm:text-lg uppercase tracking-widest italic">
                     {currentUser ? 'FAZER MINHA RESERVA' : 'ENTRE PARA RESERVAR'}
                   </span>
                 </>
               ) : (
                 <>
                   <X className="w-5 h-5 sm:w-6 sm:h-6" />
                   <span className="font-black text-sm sm:text-lg uppercase tracking-widest italic text-gray-500">SISTEMA FECHADO</span>
                 </>
               )}
            </button>
          </motion.div>
        </div>
      </section>

      {/* Sponsors Section */}
      {sponsors.length > 0 && (
        <div className="bg-[#0a0a0a] border-y border-white/5 py-10 sm:py-16 overflow-hidden relative z-20">
          <div className="max-w-7xl mx-auto px-4 mb-8 sm:mb-12">
            <h3 className="text-[10px] sm:text-xs font-black uppercase tracking-[0.4em] text-primary/40 text-center italic">
              Nossos Patrocinadores
            </h3>
          </div>
          <motion.div 
            className="flex items-center gap-16 sm:gap-24 whitespace-nowrap"
            animate={{ x: ["0%", "-50%"] }}
            transition={{ 
              repeat: Infinity, 
              duration: sponsors.length * 4 + 20, 
              ease: "linear" 
            }}
          >
            {[...sponsors, ...sponsors, ...sponsors].map((sponsor, i) => (
              <div key={`${sponsor.id}-${i}`} className="flex-shrink-0 flex items-center gap-4 grayscale opacity-30 hover:grayscale-0 hover:opacity-100 transition-all duration-500 cursor-default">
                {sponsor.imageUrl ? (
                  <img src={sponsor.imageUrl} alt={sponsor.name} className="h-10 sm:h-16 w-auto max-w-[150px] sm:max-w-[200px] object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <span className="font-black italic text-xl sm:text-3xl text-white/20 tracking-tighter uppercase">{sponsor.name}</span>
                )}
              </div>
            ))}
          </motion.div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 relative z-30">
        <div className="flex flex-col gap-20 sm:gap-32">
          
          {/* Showcase (Vitrine) */}
          {(jerseys.length > 0 || isAdmin) && (
            <section className="space-y-8 sm:space-y-12 min-h-[100px]">
              <div className="text-center">
                <h2 className="text-2xl sm:text-5xl font-black uppercase tracking-tighter italic flex items-center justify-center gap-2 sm:gap-4 px-4 leading-tight">
                  VITRINE DE <span className="text-primary">GLÓRIA</span>
                </h2>
                <div className="w-16 sm:w-24 h-1 bg-primary mx-auto mt-4 rounded-full" />
              </div>

              {jerseys.length === 0 ? (
                <div className="bg-white/5 border border-dashed border-white/10 rounded-[2.5rem] p-12 text-center max-w-4xl mx-auto">
                   <Star className="w-10 h-10 text-gray-800 mx-auto mb-4 opacity-30" />
                   <p className="text-gray-500 font-black uppercase tracking-widest text-xs italic">
                     {isAdmin ? "Admin: Adicione itens na vitrine pelo painel de controle." : "Em breve, novos modelos serão revelados."}
                   </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                  {jerseys.map((jersey, idx) => (
                    <motion.div
                      key={jersey.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="group relative bg-[#111] border border-[#1a3b32] rounded-[2.5rem] overflow-hidden shadow-2xl hover:border-primary/40 transition-all hover:-translate-y-2"
                    >
                      <div className="aspect-[4/5] overflow-hidden relative">
                        <img 
                          src={jersey.imageUrl} 
                          alt={jersey.name}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
                        
                        {jersey.price && (
                          <div className="absolute top-6 right-6 bg-primary text-black font-black px-4 py-2 rounded-xl text-sm shadow-xl italic">
                            {jersey.price}
                          </div>
                        )}
                      </div>
                      
                      <div className="p-8">
                        <h3 className="text-2xl font-black uppercase italic tracking-tight mb-2 group-hover:text-primary transition-colors">
                          {jersey.name}
                        </h3>
                        {jersey.description && (
                          <p className="text-gray-500 text-sm font-medium leading-relaxed italic line-clamp-2">
                            {jersey.description}
                          </p>
                        )}
                        
                        <div className="mt-6 flex items-center justify-between">
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map(star => (
                              <Star key={star} className="w-3 h-3 text-primary fill-primary" />
                            ))}
                          </div>
                          <span className="text-[10px] font-black uppercase text-primary/50 tracking-widest">Modelo Oficial</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Registrations List */}
          <div className="space-y-8 mt-4">
             <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-[#1a3b32] pb-4 gap-4">
                <div>
                   <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter italic flex items-center gap-3">
                      CONVOCAÇÃO <span className="text-primary">OFICIAL</span>
                   </h2>
                   <p className="text-gray-500 text-xs sm:text-sm font-medium mt-1 uppercase tracking-widest leading-relaxed">Confira quem já garantiu o seu uniforme</p>
                </div>
                 <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => currentUser ? setIsModalOpen(true) : handleLogin()}
                      className="bg-primary hover:bg-primary/90 text-black font-black text-[10px] px-4 sm:px-6 py-3 rounded-2xl transition-all shadow-xl uppercase italic tracking-widest active:scale-95 whitespace-nowrap"
                    >
                      FAZER RESERVA
                    </button>
                    {isAdmin && (
                      <button
                        onClick={exportToCSV}
                        className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary hover:text-white transition-colors bg-[#1a3b32]/30 px-4 sm:px-5 py-3 rounded-2xl border border-primary/20 whitespace-nowrap"
                      >
                        <Download className="w-4 h-4" />
                        Exportar
                      </button>
                    )}
                 </div>
             </div>

             <div className="bg-[#111] border border-[#1a3b32] rounded-[2rem] overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                   <table className="w-full text-left border-collapse">
                      <thead>
                         <tr className="bg-[#1a3b32] text-primary text-[10px] uppercase font-black tracking-[0.3em]">
                            <th className="px-4 sm:px-8 py-3 whitespace-nowrap">NOME NO MANTO</th>
                            <th className="px-4 sm:px-8 py-3">Nº</th>
                            <th className="px-4 sm:px-8 py-3">TAM</th>
                            <th className="px-4 sm:px-8 py-3 text-center">QTD</th>
                            <th className="px-4 sm:px-8 py-3 text-center">SITUAÇÃO</th>
                            <th className="px-4 sm:px-8 py-3 text-right">AÇÃO</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1a3b32]/30">
                         <AnimatePresence mode='popLayout'>
                            {registrations.length === 0 ? (
                               <tr>
                                  <td colSpan={6} className="px-8 py-24 text-center">
                                     <Trophy className="w-16 h-16 text-gray-800 mx-auto mb-4 opacity-20" />
                                     <p className="text-gray-600 font-bold uppercase tracking-widest">Nenhuma reserva confirmada</p>
                                  </td>
                               </tr>
                            ) : (
                               registrations.map((reg) => (
                                  <motion.tr
                                    key={reg.id}
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="hover:bg-white/[0.02] transition-colors group"
                                  >
                                     <td className="px-4 sm:px-8 py-3">
                                        <h4 className="text-base sm:text-lg font-black uppercase tracking-tight italic leading-tight">{reg.name}</h4>
                                        <div className="flex flex-wrap gap-2 mt-0.5">
                                          <span className="text-[8px] bg-primary text-black px-1.5 py-0.5 rounded-full font-bold uppercase tracking-widest border border-primary/20 shrink-0">
                                            {reg.jerseyName}
                                          </span>
                                          {currentUser?.uid === reg.userId && (
                                             <span className="text-[8px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold uppercase tracking-widest border border-primary/20 shrink-0">Sua Reserva</span>
                                          )}
                                          <span className="text-[8px] bg-white/5 text-primary px-1.5 py-0.5 rounded-full font-bold uppercase tracking-widest border border-primary/10 shrink-0">
                                            Responsável: {reg.responsibleName}
                                          </span>
                                          {reg.recipientType && reg.recipientType !== 'Atleta' && (
                                            <span className="text-[8px] bg-white/5 text-gray-500 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-widest border border-white/10 shrink-0">
                                              Para: {reg.recipientName || (reg.recipientType === 'Familia' ? 'Família' : reg.recipientType)}
                                            </span>
                                          )}
                                        </div>
                                     </td>
                                     <td className="px-4 sm:px-8 py-3">
                                        <div className="bg-[#1a3b32] text-primary w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-base sm:text-lg font-black italic border border-primary/20 shadow-inner">
                                           {reg.number.padStart(2, '0')}
                                        </div>
                                     </td>
                                     <td className="px-4 sm:px-8 py-3">
                                        <span className="text-base sm:text-lg font-black text-primary italic uppercase">{reg.size}</span>
                                     </td>
                                     <td className="px-4 sm:px-8 py-3 text-center">
                                        <span className="text-base sm:text-lg font-black text-white italic">{reg.quantity}</span>
                                     </td>
                                     <td className="px-4 sm:px-8 py-3">
                                        <div className="flex justify-center">
                                           {isAdmin ? (
                                             <select
                                               value={reg.status || 'Pendente'}
                                               onChange={(e) => updateJerseyStatus(reg.id, e.target.value as any)}
                                               className={`text-[8px] sm:text-[9px] font-black uppercase tracking-widest px-2 sm:px-3 py-1 rounded-lg border focus:outline-none cursor-pointer transition-all ${
                                                 reg.status === 'Pago' ? 'bg-green-500/10 border-green-500/30 text-green-500' :
                                                 reg.status === 'Entregue' ? 'bg-blue-500/10 border-blue-500/30 text-blue-500' :
                                                 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500'
                                               }`}
                                             >
                                               <option value="Pendente" className="bg-[#111]">Pendente</option>
                                               <option value="Pago" className="bg-[#111]">Pago</option>
                                               <option value="Entregue" className="bg-[#111]">Entregue</option>
                                             </select>
                                           ) : (
                                             <span className={`text-[8px] sm:text-[9px] font-black uppercase tracking-widest px-2 sm:px-3 py-1 rounded-lg border ${
                                               reg.status === 'Pago' ? 'bg-green-500/10 border-green-500/30 text-green-500' :
                                               reg.status === 'Entregue' ? 'bg-blue-500/10 border-blue-500/30 text-blue-500' :
                                               'bg-yellow-500/10 border-yellow-500/30 text-yellow-500'
                                             }`}>
                                               {reg.status || 'Pendente'}
                                             </span>
                                           )}
                                        </div>
                                     </td>
                                     <td className="px-4 sm:px-8 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                          {(currentUser?.uid === reg.userId || isAdmin) && (
                                            <button
                                              onClick={() => startEditing(reg)}
                                              className="text-[10px] font-black text-primary hover:bg-primary/10 px-4 py-2 rounded-xl transition-all uppercase tracking-tighter"
                                            >
                                              EDITAR
                                            </button>
                                          )}
                                          {currentUser?.uid === reg.userId || isAdmin ? (
                                            <button
                                              onClick={() => removeRegistration(reg.id)}
                                              className="text-[10px] font-black text-red-500/40 hover:text-red-500 hover:bg-red-500/10 px-4 py-2 rounded-xl transition-all uppercase tracking-tighter flex items-center gap-2"
                                            >
                                               <X className="w-4 h-4" /> REMOVER
                                            </button>
                                          ) : (
                                            <div className="w-4 h-4 rounded-full bg-green-500/20 border border-green-500/40" title="Número Ocupado" />
                                          )}
                                        </div>
                                     </td>
                                  </motion.tr>
                               ))
                            )}
                         </AnimatePresence>
                      </tbody>
                   </table>
                </div>
             </div>
          </div>
        </div>
      </main>

      {/* Registration Modal */}
      <AnimatePresence>
        {isAdminPanelOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdminPanelOpen(false)}
              className="fixed inset-0 bg-black/95 backdrop-blur-2xl"
            />
            
            <motion.div
              layoutId="admin-modal"
              initial={{ opacity: 0, scale: 0.9, y: 50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 50 }}
              className="relative bg-[#0a0a0a] border border-primary/30 w-full max-w-3xl rounded-[3rem] overflow-hidden shadow-[0_0_100px_rgba(212,175,55,0.1)] my-8"
            >
              <div className="bg-[#1a3b32] p-10 pb-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary opacity-5 rounded-full -mr-32 -mt-32 blur-[100px]" />
                <button 
                  onClick={() => setIsAdminPanelOpen(false)}
                  className="absolute top-8 right-8 p-3 bg-black/40 hover:bg-black/60 rounded-full transition-all hover:scale-110 active:scale-90"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
                <div className="flex items-center gap-6 mb-6">
                  <div className="bg-black/20 p-4 rounded-3xl border border-primary/20">
                    <Settings className="w-10 h-10 text-primary drop-shadow-[0_0_15px_rgba(212,175,55,0.5)]" />
                  </div>
                  <div>
                    <h3 className="text-4xl font-black uppercase italic tracking-tighter leading-none mb-1">PAINEL DO <br /> COMANDANTE</h3>
                    <p className="text-primary text-[10px] font-black uppercase tracking-[0.3em] opacity-70">Controle total da operação</p>
                  </div>
                </div>

                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={() => setActiveAdminTab('design')}
                        className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeAdminTab === 'design' ? 'bg-primary text-black' : 'hover:bg-white/5 text-gray-500'}`}
                      >
                        Identidade
                      </button>
                      <button 
                        onClick={() => setActiveAdminTab('textos')}
                        className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeAdminTab === 'textos' ? 'bg-primary text-black' : 'hover:bg-white/5 text-gray-500'}`}
                      >
                        Conteúdo
                      </button>
                      <button 
                        onClick={() => setActiveAdminTab('vitrine')}
                        className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeAdminTab === 'vitrine' ? 'bg-primary text-black' : 'hover:bg-white/5 text-gray-500'}`}
                      >
                        Vitrine
                      </button>
                      <button 
                        onClick={() => setActiveAdminTab('patrocinadores')}
                        className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeAdminTab === 'patrocinadores' ? 'bg-primary text-black' : 'hover:bg-white/5 text-gray-500'}`}
                      >
                        Patrocinadores
                      </button>
                      <button 
                        onClick={() => setActiveAdminTab('stats')}
                        className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeAdminTab === 'stats' ? 'bg-primary text-black' : 'hover:bg-white/5 text-gray-500'}`}
                      >
                        Stats
                      </button>
                      <button 
                        onClick={() => setActiveAdminTab('reservas')}
                        className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeAdminTab === 'reservas' ? 'bg-primary text-black' : 'hover:bg-white/5 text-gray-500'}`}
                      >
                        Reservas
                      </button>
                    </div>
              </div>

              {adminError && (
                <div className="mx-10 mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400 text-[10px] font-black uppercase tracking-widest">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {adminError}
                </div>
              )}

              <form onSubmit={handleSaveConfig} className="p-10 bg-[#0a0a0a] space-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
                
                {activeAdminTab === 'design' && (
                  <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <label className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Branding (Cor Principal)</label>
                        <div className="flex items-center gap-4">
                          <input
                            type="color"
                            value={configForm.primaryColor}
                            onChange={(e) => setConfigForm({...configForm, primaryColor: e.target.value})}
                            className="w-16 h-16 bg-transparent border-0 rounded-2xl cursor-pointer"
                          />
                          <div className="flex-1 bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 font-mono text-sm uppercase">
                            {configForm.primaryColor}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <label className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Logo do Time</label>
                        <div className="flex flex-col gap-4">
                          <div className="w-full aspect-video bg-white/5 border-2 border-dashed border-white/20 rounded-3xl flex items-center justify-center overflow-hidden">
                            {configForm.logoUrl ? (
                              <img src={configForm.logoUrl} className="max-h-[80%] max-w-[80%] object-contain" alt="Preview Logo" referrerPolicy="no-referrer" />
                            ) : (
                              <Trophy className="w-10 h-10 text-gray-800" />
                            )}
                          </div>
                          <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'logoUrl')} className="hidden" id="logo-upload" />
                          <label htmlFor="logo-upload" className="w-full bg-white/5 hover:bg-white/10 py-4 rounded-xl text-center text-[10px] font-black uppercase tracking-widest cursor-pointer border border-white/10 transition-all">
                            TROCAR LOGO
                          </label>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <label className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Banner Principal</label>
                        <div className="flex flex-col gap-4">
                          <div className="w-full aspect-video bg-white/5 border-2 border-dashed border-white/20 rounded-3xl flex items-center justify-center overflow-hidden">
                            {configForm.bannerUrl ? (
                              <img src={configForm.bannerUrl} className="w-full h-full object-cover" alt="Preview Banner" referrerPolicy="no-referrer" />
                            ) : (
                              <Camera className="w-10 h-10 text-gray-800" />
                            )}
                          </div>
                          <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'bannerUrl')} className="hidden" id="banner-upload" />
                          <label htmlFor="banner-upload" className="w-full bg-white/5 hover:bg-white/10 py-4 rounded-xl text-center text-[10px] font-black uppercase tracking-widest cursor-pointer border border-white/10 transition-all">
                            TROCAR BANNER
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeAdminTab === 'textos' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-8"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Nome do Site (Parte 1)</label>
                        <input
                          type="text"
                          value={configForm.siteName || ''}
                          onChange={(e) => setConfigForm({...configForm, siteName: e.target.value})}
                          className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-primary focus:bg-white/10 transition-all font-black text-sm uppercase"
                          placeholder="PELOTÃO"
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Nome do Site (Destaque)</label>
                        <input
                          type="text"
                          value={configForm.siteNameHighlight || ''}
                          onChange={(e) => setConfigForm({...configForm, siteNameHighlight: e.target.value})}
                          className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-primary focus:bg-white/10 transition-all font-black text-sm uppercase"
                          placeholder="ESPECIAL"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Nome da Época/Estação</label>
                        <input
                          type="text"
                          value={configForm.seasonText}
                          onChange={(e) => setConfigForm({...configForm, seasonText: e.target.value})}
                          className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-primary focus:bg-white/10 transition-all font-black text-sm uppercase"
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">WhatsApp de Contato</label>
                        <input
                          type="text"
                          value={configForm.contactPhone || ''}
                          onChange={(e) => setConfigForm({...configForm, contactPhone: e.target.value})}
                          className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-primary focus:bg-white/10 transition-all font-mono text-sm"
                          placeholder="(00) 00000-0000"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Título de Impacto (Banner)</label>
                      <input
                        type="text"
                        value={configForm.heroTitle}
                        onChange={(e) => setConfigForm({...configForm, heroTitle: e.target.value})}
                        className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-5 focus:outline-none focus:border-primary focus:bg-white/10 transition-all font-black italic text-xl uppercase tracking-tight"
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Subtítulo do Banner</label>
                      <textarea
                        rows={3}
                        value={configForm.heroSubtitle}
                        onChange={(e) => setConfigForm({...configForm, heroSubtitle: e.target.value})}
                        className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-5 focus:outline-none focus:border-primary focus:bg-white/10 transition-all font-medium text-sm leading-relaxed"
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Texto do Rodapé (Direitos/Slogan)</label>
                      <input
                        type="text"
                        value={configForm.footerText || ''}
                        onChange={(e) => setConfigForm({...configForm, footerText: e.target.value})}
                        className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-primary focus:bg-white/10 transition-all font-medium text-xs uppercase tracking-widest"
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Slogan Final (Ao lado do telefone)</label>
                      <input
                        type="text"
                        value={configForm.footerSlogan || ''}
                        onChange={(e) => setConfigForm({...configForm, footerSlogan: e.target.value})}
                        className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-primary focus:bg-white/10 transition-all font-medium text-xs uppercase tracking-widest"
                      />
                    </div>

                    <div className="space-y-3 pt-6 border-t border-white/5">
                      <div className="flex items-center justify-between bg-white/5 p-6 rounded-[2rem] border border-white/10">
                        <div>
                          <p className="text-sm font-black uppercase italic tracking-tight">Status do Sistema</p>
                          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Abre ou fecha o formulário de reservas</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setConfigForm({...configForm, isOpen: !configForm.isOpen})}
                          className={`relative w-16 h-8 rounded-full transition-all duration-300 ${configForm.isOpen ? 'bg-green-500' : 'bg-red-500'}`}
                        >
                          <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all duration-300 ${configForm.isOpen ? 'left-9' : 'left-1'}`} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeAdminTab === 'vitrine' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-10"
                  >
                    <div className="bg-primary/5 border border-primary/20 p-8 rounded-[2.5rem] space-y-6">
                      <div className="flex items-center gap-4 mb-2">
                        <Star className="w-6 h-6 text-primary" />
                        <h4 className="text-xl font-black uppercase italic tracking-tight">{editingJersey ? 'Editar Camisa' : 'Adicionar Nova Camisa'}</h4>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <label className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Nome do Modelo</label>
                          <input
                            type="text"
                            value={jerseyForm.name}
                            onChange={(e) => setJerseyForm({...jerseyForm, name: e.target.value.toUpperCase()})}
                            className="w-full bg-black/40 border-2 border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-primary transition-all font-black text-sm"
                            placeholder="EX: MANTO TITULAR 2026"
                          />
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Preço (Opcional)</label>
                          <input
                            type="text"
                            value={jerseyForm.price || ''}
                            onChange={(e) => setJerseyForm({...jerseyForm, price: e.target.value})}
                            className="w-full bg-black/40 border-2 border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-primary transition-all font-bold text-sm"
                            placeholder="EX: R$ 149,90"
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Descrição Curta</label>
                        <input
                          type="text"
                          value={jerseyForm.description || ''}
                          onChange={(e) => setJerseyForm({...jerseyForm, description: e.target.value})}
                          className="w-full bg-black/40 border-2 border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-primary transition-all font-medium text-sm"
                          placeholder="EX: Tecido tecnológico com detalhes bordados em alta definição."
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                        <div className="space-y-4">
                          <label className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Foto da Camisa</label>
                          <div className="flex flex-col gap-4">
                            <div className="aspect-[4/5] bg-black/40 border-2 border-dashed border-white/20 rounded-3xl flex items-center justify-center overflow-hidden">
                              {jerseyForm.imageUrl ? (
                                <img src={jerseyForm.imageUrl} className="w-full h-full object-cover" alt="Preview" referrerPolicy="no-referrer" />
                              ) : (
                                <Camera className="w-10 h-10 text-gray-800" />
                              )}
                            </div>
                            <input type="file" accept="image/*" onChange={handleJerseyImageChange} className="hidden" id="jersey-upload" />
                            <label htmlFor="jersey-upload" className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 py-4 rounded-xl text-center text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all">
                              Upload de Foto
                            </label>
                          </div>
                        </div>
                        <div className="space-y-4">
                           <div className="space-y-3 mb-6">
                            <label className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Ordem de Exibição</label>
                            <input
                              type="number"
                              value={jerseyForm.order}
                              onChange={(e) => {
                              const val = parseInt(e.target.value);
                              setJerseyForm({...jerseyForm, order: isNaN(val) ? 0 : val});
                            }}
                              className="w-full bg-black/40 border-2 border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-primary transition-all font-black"
                            />
                          </div>
                          <div className="flex gap-4">
                            <button
                              type="button"
                              onClick={handleSaveJersey}
                              className="flex-1 bg-primary text-black font-black py-4 rounded-2xl shadow-xl hover:opacity-90 active:scale-95 transition-all uppercase tracking-tighter"
                            >
                              {editingJersey ? 'Atualizar' : 'Adicionar'}
                            </button>
                            {editingJersey && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingJersey(null);
                                  setJerseyForm({ name: '', imageUrl: '', description: '', order: jerseys.length + 1, price: '' });
                                }}
                                className="flex-1 bg-white/5 text-gray-400 font-black py-4 rounded-2xl border border-white/10 hover:bg-white/10 transition-all uppercase tracking-tighter"
                              >
                                Cancelar
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">Camisas Cadastradas</h4>
                      {jerseys.length === 0 ? (
                        <div className="bg-white/5 border border-dashed border-white/10 rounded-3xl p-10 text-center">
                          <Trophy className="w-8 h-8 text-gray-800 mx-auto mb-2 opacity-20" />
                          <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Nenhuma camisa na vitrine</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                          {jerseys.map(j => (
                            <div key={j.id} className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden group">
                              <div className="aspect-[4/5] relative">
                                <img src={j.imageUrl} className="w-full h-full object-cover" alt={j.name} referrerPolicy="no-referrer" />
                                <div className="absolute inset-x-0 bottom-0 bg-black/80 p-3 flex items-center justify-center gap-4 border-t border-white/10">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingJersey(j);
                                      setJerseyForm({
                                        name: j.name,
                                        imageUrl: j.imageUrl,
                                        description: j.description || '',
                                        order: j.order || 0,
                                        price: j.price || ''
                                      });
                                      // Scroll form into view
                                      window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    className="p-2.5 bg-primary text-black rounded-xl hover:scale-110 active:scale-95 transition-all shadow-lg flex items-center gap-2"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                    <span className="text-[9px] font-black uppercase tracking-tighter sm:inline hidden">Editar</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeJersey(j.id);
                                    }}
                                    className="p-2.5 bg-red-500 text-white rounded-xl hover:scale-110 active:scale-95 transition-all shadow-lg flex items-center gap-2"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    <span className="text-[9px] font-black uppercase tracking-tighter sm:inline hidden">Excluir</span>
                                  </button>
                                </div>
                              </div>
                              <div className="p-4">
                                <p className="text-[10px] font-black uppercase truncate">{j.name}</p>
                                <p className="text-[8px] text-primary font-bold mt-1">Ordem: {j.order}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {activeAdminTab === 'patrocinadores' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-10"
                  >
                    <div className="bg-primary/5 border border-primary/20 p-8 rounded-[2.5rem] space-y-6">
                      <div className="flex items-center gap-4 mb-2">
                        <Users className="w-6 h-6 text-primary" />
                        <h4 className="text-xl font-black uppercase italic tracking-tight">{editingSponsor ? 'Editar Patrocinador' : 'Adicionar Patrocinador'}</h4>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <label className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Nome da Empresa</label>
                          <input
                            type="text"
                            value={sponsorForm.name}
                            onChange={(e) => setSponsorForm({...sponsorForm, name: e.target.value.toUpperCase()})}
                            className="w-full bg-black/40 border-2 border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-primary transition-all font-black text-sm"
                            placeholder="EX: ACME CORP"
                          />
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Ordem</label>
                          <input
                            type="number"
                            value={sponsorForm.order}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              setSponsorForm({...sponsorForm, order: isNaN(val) ? 0 : val});
                            }}
                            className="w-full bg-black/40 border-2 border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-primary transition-all font-black text-sm"
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <label className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Logo (Opcional - se não tiver, exibirá o nome)</label>
                        <div className="flex flex-col gap-4">
                          <div className="h-32 bg-black/40 border-2 border-dashed border-white/20 rounded-3xl flex items-center justify-center overflow-hidden">
                            {sponsorForm.imageUrl ? (
                              <img src={sponsorForm.imageUrl} className="max-h-[80%] max-w-[80%] object-contain" alt="Preview Sponsor" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="text-center">
                                <Camera className="w-8 h-8 text-gray-800 mx-auto mb-1" />
                                <span className="text-[10px] text-gray-700 font-bold uppercase">Sem Logo</span>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-4">
                            <input type="file" accept="image/*" onChange={handleSponsorImageChange} className="hidden" id="sponsor-upload" />
                            <label htmlFor="sponsor-upload" className="flex-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 py-4 rounded-xl text-center text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all">
                              Upload Logo
                            </label>
                            {sponsorForm.imageUrl && (
                              <button 
                                type="button" 
                                onClick={() => setSponsorForm({...sponsorForm, imageUrl: ''})}
                                className="px-6 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-all"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-4 pt-4">
                        <button
                          type="button"
                          onClick={handleSaveSponsor}
                          className="flex-1 bg-primary text-black font-black py-4 rounded-2xl shadow-xl hover:opacity-90 active:scale-95 transition-all uppercase tracking-tighter"
                        >
                          {editingSponsor ? 'Atualizar' : 'Adicionar'}
                        </button>
                        {editingSponsor && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSponsor(null);
                              setSponsorForm({ name: '', imageUrl: '', order: sponsors.length + 1 });
                            }}
                            className="flex-1 bg-white/5 text-gray-400 font-black py-4 rounded-2xl border border-white/10 hover:bg-white/10 transition-all uppercase tracking-tighter"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-6">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">Patrocinadores Atuais</h4>
                      {sponsors.length === 0 ? (
                        <div className="bg-white/5 border border-dashed border-white/10 rounded-3xl p-10 text-center">
                          <Users className="w-8 h-8 text-gray-800 mx-auto mb-2 opacity-20" />
                          <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Nenhum patrocinador cadastrado</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-3">
                          {sponsors.map(s => (
                            <div key={s.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between group">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-black/40 rounded-lg flex items-center justify-center overflow-hidden border border-white/5">
                                  {s.imageUrl ? (
                                    <img src={s.imageUrl} className="w-full h-full object-contain" alt={s.name} referrerPolicy="no-referrer" />
                                  ) : (
                                    <span className="text-[10px] font-black text-primary">{s.name.charAt(0)}</span>
                                  )}
                                </div>
                                <div>
                                  <p className="text-[11px] font-black uppercase tracking-tight italic">{s.name}</p>
                                  <p className="text-[9px] text-gray-500 font-bold">ORDEM: {s.order}</p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingSponsor(s);
                                    setSponsorForm({
                                      name: s.name,
                                      imageUrl: s.imageUrl || '',
                                      order: s.order
                                    });
                                  }}
                                  className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary transition-all hover:text-black"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    console.log("Removing sponsor:", s.id);
                                    removeSponsor(s.id);
                                  }}
                                  className="p-3 bg-red-500/20 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all transform active:scale-90"
                                  title="Remover Patrocinador"
                                >
                                  <Trash2 className="w-5 h-5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {activeAdminTab === 'stats' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-8"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-[#1a3b32]/30 p-8 rounded-3xl border border-primary/10">
                        <p className="text-[10px] font-black uppercase text-gray-500 mb-2">Pagos / Totais</p>
                        <p className="text-4xl font-black italic">{registrations.filter(r => r.status === 'Pago').length} / {registrations.length}</p>
                      </div>
                      <div className="bg-[#1a3b32]/30 p-8 rounded-3xl border border-primary/10">
                        <p className="text-[10px] font-black uppercase text-gray-500 mb-2">Entregues</p>
                        <p className="text-4xl font-black italic">{registrations.filter(r => r.status === 'Entregue').length}</p>
                      </div>
                    </div>
                    
                    <div className="bg-black/40 p-8 rounded-[2.5rem] border border-white/5">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-6">Resumo por Tamanho</h4>
                      <div className="space-y-4">
                        {JERSEY_SIZES.map(s => {
                          const count = registrations.filter(r => r.size === s).reduce((acc, curr) => acc + curr.quantity, 0);
                          const percentage = registrations.length > 0 ? (count / registrations.reduce((acc, curr) => acc + curr.quantity, 0) * 100).toFixed(0) : 0;
                          return (
                            <div key={s} className="space-y-2">
                              <div className="flex justify-between text-xs font-black uppercase italic">
                                <span>Tamanho {s}</span>
                                <span>{count} un ({percentage}%)</span>
                              </div>
                              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                <motion.div initial={{ width: 0 }} animate={{ width: `${percentage}%` }} transition={{ duration: 1 }} className="h-full bg-primary" />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={exportToCSV}
                      className="w-full flex items-center justify-center gap-4 bg-white/5 hover:bg-white/10 text-white font-black py-8 rounded-3xl border-2 border-white/10 transition-all uppercase tracking-widest text-sm"
                    >
                      <Download className="w-6 h-6 text-primary" />
                      EXPORTAR RELATÓRIO COMPLETO (CSV)
                    </button>
                  </motion.div>
                )}

                {activeAdminTab === 'reservas' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Lista de Reservas</h4>
                      <div className="flex gap-2">
                        <button 
                          type="button" 
                          onClick={() => { setIsAdminPanelOpen(false); setIsModalOpen(true); }} 
                          className="text-[9px] font-black uppercase tracking-widest bg-primary text-black px-4 py-2 rounded-lg shadow-lg flex items-center gap-2"
                        >
                          <Plus className="w-3 h-3" /> Nova Reserva
                        </button>
                        <button type="button" onClick={exportToCSV} className="text-[9px] font-black uppercase tracking-widest bg-white/5 px-4 py-2 rounded-lg border border-white/10 flex items-center gap-2">
                          <Download className="w-3 h-3" /> Exportar CSV
                        </button>
                      </div>
                    </div>
                    
                    <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
                      <div className="max-h-[40vh] overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse text-[10px]">
                          <thead>
                            <tr className="bg-white/5 font-black uppercase tracking-widest text-gray-500">
                              <th className="px-6 py-4">Nº</th>
                              <th className="px-6 py-4">Modelo</th>
                              <th className="px-6 py-4">Nome (Camisa)</th>
                              <th className="px-6 py-4">Responsável</th>
                              <th className="px-6 py-4">Situação</th>
                              <th className="px-6 py-4 text-right">Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {registrations.map(reg => (
                              <tr key={reg.id} className="hover:bg-white/[0.02]">
                                <td className="px-6 py-4 font-black text-primary">{reg.number}</td>
                                <td className="px-6 py-4 font-bold text-[9px] text-gray-400 italic uppercase">{reg.jerseyName}</td>
                                <td className="px-6 py-4 font-bold uppercase">{reg.name}</td>
                                <td className="px-6 py-4 font-medium text-gray-400 capitalize">{reg.responsibleName}</td>
                                <td className="px-6 py-4">
                                  <select
                                    value={reg.status || 'Pendente'}
                                    onChange={(e) => updateJerseyStatus(reg.id, e.target.value as any)}
                                    className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-md border bg-black overflow-hidden ${
                                      reg.status === 'Pago' ? 'border-green-500/30 text-green-500' :
                                      reg.status === 'Entregue' ? 'border-blue-500/30 text-blue-500' :
                                      'border-yellow-500/30 text-yellow-500'
                                    }`}
                                  >
                                    <option value="Pendente">Pendente</option>
                                    <option value="Pago">Pago</option>
                                    <option value="Entregue">Entregue</option>
                                  </select>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button 
                                      type="button" 
                                      onClick={() => { setIsAdminPanelOpen(false); startEditing(reg); }} 
                                      className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-all border border-primary/20"
                                    >
                                      <Settings className="w-3 h-3" /> EDITAR
                                    </button>
                                    <button 
                                      type="button" 
                                      onClick={() => removeRegistration(reg.id)} 
                                      className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-red-500/60 hover:text-red-500 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-all border border-red-500/20"
                                    >
                                      <X className="w-3 h-3" /> EXCLUIR
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-4 pt-4 sticky bottom-0 bg-[#0a0a0a] pb-2">
                   <button
                    type="button"
                    onClick={() => setIsAdminPanelOpen(false)}
                    className="flex-1 border-2 border-white/10 text-gray-400 hover:text-white hover:border-white/30 font-black py-6 rounded-2xl transition-all uppercase tracking-tighter"
                  >
                    DESCARTAR
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] bg-primary hover:opacity-90 text-black font-black py-6 rounded-2xl transition-all shadow-xl active:scale-95 uppercase tracking-tighter"
                  >
                    EFETUAR ALTERAÇÕES
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 bg-black/90 backdrop-blur-xl"
            />
            
            <motion.div
              layoutId="modal"
              initial={{ opacity: 0, scale: 0.9, y: 50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 50 }}
              className="relative bg-[#111] border border-primary/30 w-full max-w-lg rounded-[3rem] overflow-hidden shadow-2xl my-8"
            >
              <div className="bg-[#1a3b32] p-6 sm:p-10 sm:pb-16 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary opacity-5 rounded-full -mr-32 -mt-32 blur-[100px]" />
                <button 
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingRegistration(null);
                  }}
                  className="absolute top-4 right-4 sm:top-8 sm:right-8 p-3 bg-black/60 hover:bg-black/80 text-white rounded-full transition-all hover:scale-110 active:scale-90 z-50 border border-white/10"
                >
                  <X className="w-6 h-6" />
                </button>
                <div className="flex-1 text-left">
                  <h3 className="text-[31px] sm:text-4xl font-black uppercase italic tracking-tighter leading-none mb-1">
                    {editingRegistration ? 'EDITAR MINHA' : 'PERSONALIZAR'} {editingRegistration ? 'RESERVA' : 'MANTO'}
                  </h3>
                  <p className="text-primary text-[9px] sm:text-xs font-black uppercase tracking-[0.3em] opacity-70 italic shadow-sm">Defina os detalhes da sua glória</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="p-4 sm:p-8 -mt-5 sm:-mt-8 bg-[#111] rounded-t-[1.5rem] sm:rounded-t-[3rem] relative z-10 space-y-4 sm:space-y-6 text-[14px]">
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3 text-red-500 text-xs font-bold"
                  >
                    <div className="bg-red-500 p-1 rounded-full">
                       <AlertCircle className="w-3.5 h-3.5 text-white" />
                    </div>
                    {error}
                  </motion.div>
                )}

                {/* Jersey Model Selection */}
                <div className="space-y-2">
                  <label className="text-[8px] uppercase font-black tracking-[0.3em] text-gray-400 pl-2">Modelo</label>
                  {jerseys.length === 0 ? (
                    <div className="p-4 bg-white/5 border border-dashed border-white/10 rounded-2xl text-center">
                      <p className="text-gray-500 text-[9px] font-black uppercase tracking-widest">Nenhum modelo disponível.</p>
                    </div>
                  ) : (
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none snap-x">
                      {jerseys.map(jersey => (
                        <button
                          key={jersey.id}
                          type="button"
                          onClick={() => {
                            setSelectedJerseyId(jersey.id);
                            setSelectedJerseyName(jersey.name);
                          }}
                          className={`flex-none w-28 sm:w-32 p-1.5 rounded-xl border-2 transition-all group relative snap-start ${
                            selectedJerseyId === jersey.id
                              ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                              : 'border-white/10 hover:border-white/20 bg-white/2'
                          }`}
                        >
                          <div className="aspect-square rounded-lg overflow-hidden mb-1.5">
                            <img src={jersey.imageUrl} className="w-full h-full object-cover" alt={jersey.name} referrerPolicy="no-referrer" />
                          </div>
                          <p className={`text-[8px] font-black uppercase tracking-tighter truncate ${selectedJerseyId === jersey.id ? 'text-primary' : 'text-gray-500'}`}>
                            {jersey.name}
                          </p>
                          {selectedJerseyId === jersey.id && (
                            <div className="absolute top-1 right-1 bg-primary p-0.5 rounded-full shadow-lg">
                              <Check className="w-2.5 h-2.5 text-black" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[8px] uppercase font-black tracking-[0.3em] text-gray-400 pl-2">Para quem?</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Atleta', 'Familia', 'Amigo'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setRecipientType(type)}
                        className={`py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border-2 ${
                          recipientType === type 
                            ? 'bg-primary border-primary text-black shadow-lg shadow-primary/10' 
                            : 'bg-white/5 border-white/10 text-gray-500 hover:border-white/20'
                        }`}
                      >
                        {type === 'Atleta' ? 'Para Mim' : type === 'Familia' ? 'Família' : type}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {recipientType !== 'Atleta' && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="space-y-1.5"
                    >
                      <label className="text-[8px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Destinatário</label>
                      <input
                        type="text"
                        required
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        placeholder="EX: JOÃO DA SILVA"
                        className="w-full bg-white/5 border-2 border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:border-primary focus:bg-white/10 transition-all font-black tracking-tight uppercase text-sm placeholder:text-gray-800"
                      />
                    </motion.div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[8px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Responsável</label>
                    <input
                      type="text"
                      required
                      value={responsibleName}
                      onChange={(e) => setResponsibleName(e.target.value)}
                      placeholder="EX: FABIO SANTOS"
                      className="w-full bg-white/5 border-2 border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:border-primary focus:bg-white/10 transition-all font-black tracking-tight uppercase text-sm placeholder:text-gray-800"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[8px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Nome na Camisa</label>
                    <input
                      type="text"
                      required
                      maxLength={15}
                      value={name}
                      onChange={(e) => setName(e.target.value.toUpperCase())}
                      placeholder="EX: JOGADOR"
                      className="w-full bg-white/5 border-2 border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:border-primary focus:bg-white/10 transition-all font-black tracking-tight uppercase text-sm placeholder:text-gray-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[8px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Nº</label>
                    <input
                      type="number"
                      required
                      min="1"
                      max="99"
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      placeholder="99"
                      className="w-full bg-white/5 border-2 border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:border-primary focus:bg-white/10 transition-all font-black text-xl placeholder:text-gray-800 italic"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[8px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Qtd</label>
                    <select
                      value={quantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setQuantity(isNaN(val) ? 1 : val);
                      }}
                      className="w-full bg-white/5 border-2 border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:border-primary focus:bg-white/10 transition-all font-black text-sm appearance-none cursor-pointer"
                    >
                      {[1, 2, 3, 4, 5].map(q => <option key={q} value={q} className="bg-[#111]">{q} {q === 1 ? 'Camisa' : 'Camisas'}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <label className="text-[8px] uppercase font-black tracking-[0.3em] text-gray-500 pl-2">Tam</label>
                    <div className="flex gap-2">
                      {JERSEY_SIZES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSize(s as any)}
                          className={`flex-1 py-3.5 rounded-xl text-[10px] font-black transition-all border-2 ${
                            size === s 
                              ? 'bg-primary border-primary text-black shadow-md' 
                              : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                   <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setEditingRegistration(null);
                    }}
                    className="flex-1 border-2 border-white/10 text-gray-500 hover:text-white hover:border-white/30 font-black py-4 rounded-2xl transition-all uppercase tracking-tighter text-xs"
                  >
                    DESCARTAR
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] bg-primary hover:bg-primary/90 text-black font-black py-4 rounded-2xl transition-all shadow-xl shadow-primary/10 active:scale-95 uppercase tracking-tighter text-xs"
                  >
                    {editingRegistration ? 'ATUALIZAR RESERVA' : 'CONFIRMAR AGORA'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="border-t border-[#1a3b32] py-20 bg-black/40">
        <div className="max-w-7xl mx-auto px-4 text-center">
            <div className="flex flex-col items-center gap-6">
                <div className="bg-[#1a3b32] p-4 rounded-3xl border border-primary/30 shadow-2xl overflow-hidden flex items-center justify-center">
                    {siteConfig.logoUrl ? (
                        <img 
                            src={siteConfig.logoUrl} 
                            alt="Logo" 
                            className="w-10 h-10 object-contain" 
                            referrerPolicy="no-referrer"
                        />
                    ) : (
                        <Trophy className="w-8 h-8 text-primary" />
                    )}
                </div>
                <div>
                   <h5 className="font-black tracking-[0.3em] uppercase italic text-sm mb-2">{siteConfig.siteName || 'PELOTÃO'} <span className="text-primary">{siteConfig.siteNameHighlight || 'ESPECIAL'}</span></h5>
                   <p className="text-gray-600 text-xs font-medium max-w-xs mx-auto uppercase tracking-widest">{siteConfig.footerText}</p>
                </div>
                <div className="flex gap-4 mt-4">
                  <div className="w-8 h-1 bg-primary rounded-full transition-all" />
                  <div className="w-8 h-1 bg-white/10 rounded-full" />
                  <div className="w-8 h-1 bg-[#1a3b32] rounded-full" />
                </div>
                <p className="text-gray-700 text-[10px] font-black uppercase tracking-widest mt-8">© 2024 {siteConfig.siteName} {siteConfig.siteNameHighlight} • {siteConfig.footerSlogan || 'UNIDADE ACIMA DE TUDO'} • {siteConfig.contactPhone}</p>
            </div>
        </div>
      </footer>
    </div>
  );
}
