
import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  onSnapshot,
  orderBy,
  addDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  getDocs
} from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { 
  Droplet, 
  Hospital as HospitalIcon, 
  User as UserIcon, 
  LogOut, 
  Plus, 
  Bell, 
  Star, 
  Clock, 
  MapPin, 
  Phone as PhoneIcon,
  AlertTriangle,
  CheckCircle2,
  Trophy,
  History,
  Activity,
  Heart,
  Lock,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
type UserRole = 'donor' | 'hospital' | null;

interface DonorData {
  userId: string;
  displayName: string;
  email: string;
  phone: string;
  bloodGroup: string;
  lastDonationDate: any;
  bonusPoints: number;
  rating: number;
  location: string;
  isAvailable: boolean;
  role: 'donor';
}

interface HospitalData {
  userId: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  role: 'hospital';
}

interface EmergencyRequest {
  id: string;
  hospitalId: string;
  hospitalName: string;
  bloodGroup: string;
  unitsNeeded: number;
  urgency: 'high' | 'medium' | 'low';
  description: string;
  status: 'pending' | 'fulfilled' | 'cancelled';
  createdAt: any;
}

interface DonationRecord {
  id: string;
  donorId: string;
  donorName: string;
  hospitalId: string;
  hospitalName: string;
  date: any;
  bloodGroup: string;
  notes: string;
}

// --- Components ---

const Button = ({ children, onClick, variant = 'primary', icon: Icon, className = '', disabled = false }: any) => {
  const variants = {
    primary: 'bg-red-600 text-white hover:bg-red-700 shadow-sm shadow-red-200/50 uppercase tracking-widest text-[10px] sm:text-xs font-bold leading-none py-3 px-6',
    secondary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-200/50 uppercase tracking-widest text-[10px] sm:text-xs font-bold leading-none py-3 px-6',
    outline: 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 transition-colors uppercase tracking-widest text-[10px] font-bold py-2.5 px-4',
    ghost: 'text-slate-500 hover:text-slate-800 hover:bg-slate-100 uppercase tracking-widest text-[10px] font-bold py-2 px-3',
    danger: 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 uppercase tracking-widest text-[10px] font-bold py-2.5 px-4'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-2 rounded-lg transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${variants[variant as keyof typeof variants]} ${className}`}
    >
      {Icon && <Icon size={14} className="shrink-0" />}
      {children}
    </button>
  );
};

const Card = ({ children, className = '', title, icon: Icon, noPadding = false }: any) => (
  <div className={`bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden ${className}`}>
    {(title || Icon) && (
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {Icon && <div className="text-slate-400"><Icon size={18} /></div>}
          {title && <h3 className="text-sm font-bold text-slate-800 tracking-tight">{title}</h3>}
        </div>
      </div>
    )}
    <div className={noPadding ? '' : 'p-5'}>{children}</div>
  </div>
);

const Badge = ({ children, variant = 'default' }: any) => {
  const variants = {
    default: 'bg-slate-100 text-slate-600 border border-slate-200',
    urgent: 'bg-red-50 text-red-700 border border-red-100',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
    warning: 'bg-amber-50 text-amber-700 border border-amber-100'
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${variants[variant as keyof typeof variants]}`}>
      {children}
    </span>
  );
};

// --- Helpers for Error Handling ---
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
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- App Shell ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [profile, setProfile] = useState<DonorData | HospitalData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Form states
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('donor');

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const donorRef = doc(db, 'users', u.uid);
        const hospRef = doc(db, 'hospitals', u.uid);
        
        const donorSnap = await getDoc(donorRef);
        if (donorSnap.exists()) {
          setRole('donor');
          unsubProfile = onSnapshot(donorRef, (doc) => {
            if (doc.exists()) setProfile(doc.data() as DonorData);
          });
        } else {
          const hospSnap = await getDoc(hospRef);
          if (hospSnap.exists()) {
            setRole('hospital');
            unsubProfile = onSnapshot(hospRef, (doc) => {
              if (doc.exists()) setProfile(doc.data() as HospitalData);
            });
          } else {
            setRole(null);
          }
        }
      } else {
        setRole(null);
        setProfile(null);
        if (unsubProfile) unsubProfile();
      }
      setIsLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !password) return;
    setError(null);
    setIsLoading(true);

    const email = `${phone.replace(/\D/g, '')}@donor.help`;

    try {
      if (isRegistering) {
        if (!displayName) {
          setError('Iltimos, ismingizni kiriting');
          setIsLoading(false);
          return;
        }
        const { user: newUser } = await createUserWithEmailAndPassword(auth, email, password);
        
        const path = selectedRole === 'donor' ? 'users' : 'hospitals';
        const initialData = selectedRole === 'donor' ? {
          userId: newUser.uid,
          displayName,
          email,
          phone,
          bloodGroup: 'O+',
          lastDonationDate: null,
          bonusPoints: 0,
          rating: 5,
          location: '',
          isAvailable: true,
          role: 'donor'
        } : {
          userId: newUser.uid,
          name: displayName,
          email,
          address: '',
          phone,
          role: 'hospital'
        };

        await setDoc(doc(db, path, newUser.uid), initialData);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.code === 'auth/user-not-found' ? 'Foydalanuvchi topilmadi' : 
                err.code === 'auth/wrong-password' ? 'Parol noto\'g\'ri' : 
                err.code === 'auth/email-already-in-use' ? 'Ushbu telefon raqami band' : 
                err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full space-y-10"
        >
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-20 h-20 bg-red-600 rounded-3xl shadow-xl shadow-red-200 flex items-center justify-center">
                <Droplet className="text-white w-12 h-12" />
              </div>
            </div>
            <div className="space-y-1">
              <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase italic">Donor-Help</h1>
              <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Professional qon topshirish tarmog'i</p>
            </div>
          </div>

          <Card className="p-8 border-slate-200/60 shadow-2xl shadow-slate-200/30">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-6">
              {isRegistering ? 'Ro\'yxatdan o\'tish' : 'Tizimga kirish'}
            </h2>
            
            <form onSubmit={handleAuth} className="space-y-5">
              {isRegistering && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ismingiz</label>
                  <div className="relative">
                    <UserIcon className="absolute left-4 top-3.5 text-slate-300" size={18} />
                    <input 
                      type="text" 
                      placeholder="Ism Familiya" 
                      className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-100 outline-none transition-all font-medium"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Telefon Raqam</label>
                <div className="relative">
                  <PhoneIcon className="absolute left-4 top-3.5 text-slate-300" size={18} />
                  <input 
                    type="tel" 
                    placeholder="+998 90 123 45 67" 
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-100 outline-none transition-all font-medium"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Parol</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-3.5 text-slate-300" size={18} />
                  <input 
                    type="password" 
                    placeholder="••••••••" 
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-100 outline-none transition-all font-medium"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              {isRegistering && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Foydalanuvchi Turi</label>
                  <div className="flex gap-3">
                    <button 
                      type="button" 
                      onClick={() => setSelectedRole('donor')}
                      className={`flex-1 py-3 rounded-xl border text-xs font-bold transition-all ${selectedRole === 'donor' ? 'bg-red-50 border-red-200 text-red-600 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                    >
                      Donor
                    </button>
                    <button 
                      type="button"
                      onClick={() => setSelectedRole('hospital')} 
                      className={`flex-1 py-3 rounded-xl border text-xs font-bold transition-all ${selectedRole === 'hospital' ? 'bg-slate-900 border-slate-900 text-white shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                    >
                      Shifoxona
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold border border-red-100 italic">
                  {error}
                </div>
              )}

              <Button className="w-full h-14" variant="primary" type="submit" disabled={isLoading}>
                {isRegistering ? 'RO\'YXATDAN O\'TISH' : 'KIRISH'}
              </Button>
            </form>

            <div className="mt-8 pt-8 border-t border-slate-100 flex flex-col items-center gap-4">
              <button 
                onClick={() => { setIsRegistering(!isRegistering); setError(null); }}
                className="text-xs font-black text-blue-600 uppercase tracking-widest hover:underline flex items-center gap-1"
              >
                {isRegistering ? 'Men oldin ro\'yxatdan o\'tganman' : 'Yangi akkount yaratish'}
                <ChevronRight size={14} />
              </button>
              <div className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em]">
                Xavfsiz va ishonchli ulanish
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <nav className="h-16 bg-white border-b border-slate-200 sticky top-0 z-50 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center shadow-sm shadow-red-200">
            <Droplet className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-slate-800 tracking-tighter">Donor-Help</span>
        </div>
        
        <div className="flex items-center space-x-4 sm:space-x-8">
          <div className="hidden sm:flex items-center space-x-4">
            <div className="text-right">
              <p className="text-xs font-bold text-slate-800 tracking-tight">
                {role === 'donor' ? (profile as DonorData).displayName : (profile as HospitalData).name}
              </p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                {role === 'donor' ? 'Donor ID' : 'Hospital Admin'}: {profile?.userId.slice(0, 4)}
              </p>
            </div>
            <div className="w-9 h-9 bg-slate-100 rounded-full border border-slate-200 overflow-hidden flex items-center justify-center text-slate-400">
              <UserIcon size={18} />
            </div>
          </div>
          <Button onClick={() => signOut(auth)} variant="ghost" className="px-2">
            <LogOut size={16} />
          </Button>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full overflow-hidden">
        {role === 'donor' ? (
          <DonorDashboard profile={profile as DonorData} showNotification={showNotification} />
        ) : (
          <HospitalDashboard profile={profile as HospitalData} showNotification={showNotification} />
        )}
      </main>

      {/* Global Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="fixed bottom-12 left-1/2 z-[200] w-full max-w-sm px-4"
          >
            <div className={`p-4 rounded-2xl shadow-2xl border flex items-center gap-4 ${
              notification.type === 'success' ? 'bg-emerald-600 border-emerald-500 text-white' :
              notification.type === 'error' ? 'bg-red-600 border-red-500 text-white' :
              'bg-slate-900 border-slate-800 text-white'
            }`}>
              {notification.type === 'success' ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
              <p className="text-sm font-bold tracking-tight">{notification.message}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="h-8 bg-slate-100 border-t border-slate-200 px-8 flex items-center justify-between text-[10px] text-slate-500 font-bold tracking-widest uppercase shrink-0 mt-auto">
        <div className="flex items-center space-x-4">
          <span>Sistem Holati: Aktiv</span>
          <span className="h-3 w-px bg-slate-300"></span>
          <span>Versiya: 1.0.4-STABLE</span>
        </div>
        <div className="hidden sm:flex items-center space-x-1">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
          <span>Xavfsiz Ulanish</span>
        </div>
      </footer>
    </div>
  );
}

// --- Dashboards ---

function DonorDashboard({ profile, showNotification }: { profile: DonorData, showNotification: any }) {
  const [requests, setRequests] = useState<EmergencyRequest[]>([]);
  const [history, setHistory] = useState<DonationRecord[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editedBloodGroup, setEditedBloodGroup] = useState(profile.bloodGroup);
  const [selectedRequest, setSelectedRequest] = useState<EmergencyRequest | null>(null);

  const toggleAvailability = async () => {
    setIsUpdating(true);
    try {
      await updateDoc(doc(db, 'users', profile.userId), {
        isAvailable: !profile.isAvailable
      });
      showNotification(profile.isAvailable ? "Holatingiz 'Oflayn'ga o'zgartirildi" : "Holatingiz 'Aktiv'ga o'zgartirildi");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.userId}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    try {
      await updateDoc(doc(db, 'users', profile.userId), {
        bloodGroup: editedBloodGroup
      });
      setIsEditModalOpen(false);
      showNotification("Profil muvaffaqiyatli yangilandi");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.userId}`);
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    setEditedBloodGroup(profile.bloodGroup);
  }, [profile.bloodGroup]);

  useEffect(() => {
    const q = query(
      collection(db, 'emergency_requests'), 
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );
    const unsubRequests = onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as EmergencyRequest)));
    });

    const hq = query(
      collection(db, 'donations'),
      where('donorId', '==', profile.userId),
      orderBy('date', 'desc')
    );
    const unsubHistory = onSnapshot(hq, (snapshot) => {
      setHistory(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DonationRecord)));
    });

    return () => {
      unsubRequests();
      unsubHistory();
    };
  }, [profile.userId]);

  return (
    <div className="space-y-8 overflow-y-auto h-full pr-2 pb-8">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="md:col-span-3 border-none shadow-xl shadow-slate-200/40">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tighter">Xush kelibsiz, {profile.displayName}!</h2>
              <p className="text-slate-500 font-medium">Siz <span className="text-red-600 font-bold underline underline-offset-4">{profile.bloodGroup}</span> qon guruhiga egasiz.</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Bonus Ballar</p>
              <div className="flex items-center justify-end gap-1 text-slate-800 font-black text-3xl tracking-tighter">
                {profile.bonusPoints}
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-10">
            <div className="p-5 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
              <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest leading-none">Faollik</p>
              <div className="flex items-center gap-2 mt-2">
                <Activity size={16} className="text-slate-400" />
                <span className="font-black text-slate-800 tracking-tight">{history.length} marta</span>
              </div>
            </div>
            <div className="p-5 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
              <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest leading-none">Reyting</p>
              <div className="flex items-center gap-2 mt-2">
                <Star size={16} className="text-amber-500" />
                <span className="font-black text-slate-800 tracking-tight">{profile.rating}/5</span>
              </div>
            </div>
            <div className="p-5 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between cursor-pointer hover:bg-slate-100 transition-all" onClick={toggleAvailability}>
              <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest leading-none">Holat</p>
              <div className="flex items-center gap-2 mt-2">
                <div className={`w-2 h-2 rounded-full ${profile.isAvailable ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300'} ${isUpdating ? 'animate-pulse' : ''}`} />
                <span className="font-black text-slate-800 tracking-tight">{profile.isAvailable ? 'Aktiv' : 'Oflayn'}</span>
              </div>
            </div>
            <div className="p-5 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
              <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest leading-none">Hudud</p>
              <div className="flex items-center gap-2 mt-2">
                <MapPin size={16} className="text-slate-400" />
                <span className="font-black text-slate-800 tracking-tight truncate">{profile.location || 'Noma\'lum'}</span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col items-center justify-center gap-6 text-center shadow-xl shadow-slate-200/40 border-none bg-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-red-50 rounded-bl-full -mr-4 -mt-4 opacity-50"></div>
            <div className={`w-24 h-24 rounded-2xl border flex items-center justify-center text-4xl font-black ${profile.isAvailable ? 'border-red-200 text-red-600 bg-red-50 shadow-lg shadow-red-100' : 'border-slate-100 text-slate-300 bg-slate-50 underline-offset-1'}`}>
                {profile.bloodGroup}
            </div>
            <div className="space-y-1 z-10">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sizning Guruhingiz</h3>
                <p className="text-slate-900 font-bold leading-tight">Qon guruhingiz bo'yicha imkoniyatlar</p>
            </div>
            <Button variant="outline" className="w-full text-[10px]" onClick={() => setIsEditModalOpen(true)}>Profilni Tahrirlash</Button>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center text-white">
                <AlertTriangle size={18} />
              </div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight italic uppercase">
                Favqulodda So'rovlar
              </h3>
            </div>
            <Badge variant="urgent">{requests.length} TA AKTIV</Badge>
          </div>

          <div className="space-y-4">
            {requests.length > 0 ? (
              requests.map(req => (
                <motion.div key={req.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                  <Card className={`group hover:shadow-md transition-all ${req.bloodGroup === profile.bloodGroup ? 'border-red-200 bg-red-50/20' : 'border-slate-200'}`} noPadding>
                    <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-slate-100 items-stretch">
                      <div className="p-6 flex-1 space-y-4">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-1 rounded font-black text-sm border ${req.bloodGroup === profile.bloodGroup ? 'bg-red-600 text-white border-red-700' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                            {req.bloodGroup}
                          </span>
                          <div className="flex-1">
                             <h4 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1">
                                {req.hospitalName}
                             </h4>
                             <p className="text-[11px] text-slate-500 font-medium">{req.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                           <span className="flex items-center gap-1"><Clock size={12}/> {req.createdAt instanceof Timestamp ? req.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Hozir'}</span>
                           <span className={`flex items-center gap-1 ${req.urgency === 'high' ? 'text-red-500' : 'text-amber-500'}`}>
                              <Activity size={12}/> {req.urgency} shoshilinch
                           </span>
                        </div>
                      </div>
                      <div className="p-6 sm:w-48 bg-slate-50/50 flex flex-col justify-center gap-3">
                        <div className="text-center sm:text-right">
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ehtiyoj</p>
                           <p className="text-xl font-black text-slate-800 tracking-tighter leading-none">{req.unitsNeeded} UNIT</p>
                        </div>
                        <Button 
                          className="w-full" 
                          variant={req.bloodGroup === profile.bloodGroup ? 'primary' : 'outline'}
                          onClick={() => setSelectedRequest(req)}
                        >
                            YORDAM BERISH
                        </Button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-slate-200">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                  <CheckCircle2 className="text-emerald-500" size={32} />
                </div>
                <h4 className="font-bold text-slate-900 mb-1 tracking-tight">Hozircha so'rovlar yo'q</h4>
                <p className="text-sm text-slate-500">Barcha ehtiyojlar qondirilgan. Dam olishda davom eting.</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Activity size={14} className="text-red-500" />
              Qon Mosligi Strategiyasi
            </h3>
            <Card className="bg-slate-900 text-white border-0 shadow-2xl shadow-slate-900/20 relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
               <div className="space-y-6 relative z-10">
                  <div className="space-y-2">
                      <span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Siz yordam bera olasiz:</span>
                      <div className="flex flex-wrap gap-2">
                          {['O', 'A', 'B', 'AB'].filter(g => profile.bloodGroup.includes(g) || profile.bloodGroup.includes('O')).map(g => (
                              <span key={g} className="px-3 py-1 bg-white/10 rounded text-xs font-black tracking-tighter border border-white/5">{g}+</span>
                          ))}
                      </div>
                  </div>
                  <div className="h-px bg-white/5"></div>
                  <div className="space-y-2">
                      <span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Siz ololaysiz:</span>
                      <div className="flex flex-wrap gap-2">
                           <span className="px-3 py-1 bg-red-600/20 text-red-500 rounded text-xs font-black tracking-tighter border border-red-500/20">
                            {profile.bloodGroup.includes('O') ? 'O-' : profile.bloodGroup.slice(0,-1)}
                           </span>
                      </div>
                  </div>
                  <div className="pt-2">
                    <Button variant="ghost" className="w-full text-white/60 hover:text-white border border-white/10 hover:bg-white/5 tracking-widest text-[9px]">
                        TO'LIQ JADVALNI KO'RISH
                    </Button>
                  </div>
               </div>
            </Card>
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <History size={14} className="text-slate-400" />
              Tarixiy Faoliyat
            </h3>
            <div className="space-y-3">
              {history.map(item => (
                <div key={item.id} className="flex gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
                  <div className="w-10 h-10 bg-red-50 text-red-600 rounded-lg flex items-center justify-center shrink-0 border border-red-100">
                    <Heart size={20} />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <h4 className="font-bold text-slate-800 text-sm tracking-tight truncate">Donatsiya Yakunlandi</h4>
                    <p className="text-[10px] font-medium text-slate-500 uppercase tracking-tight">{item.hospitalName}</p>
                    <p className="text-[10px] text-slate-400 mt-2 font-bold flex items-center gap-1">
                      <Clock size={10}/>
                      {item.date instanceof Timestamp ? item.date.toDate().toLocaleDateString('uz-UZ', {day:'numeric', month:'long'}) : 'Hozir'}
                    </p>
                  </div>
                  <div className="text-right flex flex-col justify-center">
                      <span className="text-[10px] font-black text-emerald-500">+100 PTS</span>
                  </div>
                </div>
              ))}
              {history.length === 0 && (
                <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-100">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hali ma'lumotlar yo'q</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[2rem] shadow-2xl max-w-sm w-full overflow-hidden border border-slate-100"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="space-y-1">
                   <h3 className="text-2xl font-black text-slate-800 tracking-tighter">Profilni Tahrirlash</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Shaxsiy ma'lumotlar</p>
                </div>
                <button onClick={() => setIsEditModalOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
                  <LogOut size={16} />
                </button>
              </div>
              <form onSubmit={handleUpdateProfile} className="p-8 space-y-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Qon Guruhingiz</label>
                    <div className="grid grid-cols-4 gap-2">
                        {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map(bg => (
                            <button 
                                key={bg}
                                type="button"
                                onClick={() => setEditedBloodGroup(bg)}
                                className={`py-3 rounded-xl text-xs font-black transition-all border ${editedBloodGroup === bg ? 'bg-red-600 text-white border-red-700 shadow-md shadow-red-100' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-white'}`}
                            >
                                {bg}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="pt-4 space-y-3">
                    <Button className="w-full h-14" variant="primary" disabled={isUpdating}>
                        {isUpdating ? 'SAQLANMOQDA...' : 'O\'ZGARISHLARNI SAQLASH'}
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={() => setIsEditModalOpen(false)} type="button">
                        BEKOR QILISH
                    </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Help Modal */}
      <AnimatePresence>
        {selectedRequest && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[2rem] shadow-2xl max-w-sm w-full overflow-hidden border border-slate-100"
            >
              <div className="p-8 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center text-white font-black text-xl">
                    {selectedRequest.bloodGroup}
                  </div>
                  <button onClick={() => setSelectedRequest(null)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
                    <LogOut size={16} />
                  </button>
                </div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tighter">{selectedRequest.hospitalName}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Favqulodda yordam markazi</p>
              </div>
              <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <p className="text-sm text-slate-600 font-medium leading-relaxed">
                    Ushbu shifoxonaga zudlik bilan <span className="font-bold text-slate-900">{selectedRequest.unitsNeeded} unit</span> qon zarur. 
                    Siz yordam berish orqali inson hayotini saqlab qolishingiz mumkin.
                  </p>
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1 italic">Manzil:</p>
                    <p className="text-xs font-bold text-blue-900">Shifo ko'chasi, 12-uy. Toshkent shahar markaziy klinikasi.</p>
                  </div>
                </div>
                <Button className="w-full h-14" variant="primary" onClick={() => {
                  showNotification("So'rov qabul qilindi. Shifoxona bilan bog'laning!");
                  setSelectedRequest(null);
                }}>
                  SHIFOXONA BILAN BOG'LANISH
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HospitalDashboard({ profile, showNotification }: { profile: HospitalData, showNotification: any }) {
  const [requests, setRequests] = useState<EmergencyRequest[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [donors, setDonors] = useState<DonorData[]>([]);
  const [search血, setSearch血] = useState('');
  const [selectedDonor, setSelectedDonor] = useState<DonorData | null>(null);
  const [isConfirmingDonation, setIsConfirmingDonation] = useState(false);
  
  const [newRequest, setNewRequest] = useState({
    bloodGroup: 'O+',
    unitsNeeded: 1,
    urgency: 'medium' as any,
    description: ''
  });

  useEffect(() => {
    const q = query(
      collection(db, 'emergency_requests'), 
      where('hospitalId', '==', profile.userId),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as EmergencyRequest)));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'emergency_requests');
    });

    // Fetch donors for listing
    const fetchDonors = async () => {
        try {
            const dq = query(collection(db, 'users'), where('role', '==', 'donor'));
            const snap = await getDocs(dq);
            setDonors(snap.docs.map(d => d.data() as DonorData));
        } catch (err) {
            handleFirestoreError(err, OperationType.LIST, 'users');
        }
    };
    fetchDonors();

    return () => unsub();
  }, [profile.userId]);

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'emergency_requests'), {
        ...newRequest,
        hospitalId: profile.userId,
        hospitalName: profile.name,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setIsModalOpen(false);
      setNewRequest({ bloodGroup: 'O+', unitsNeeded: 1, urgency: 'medium', description: '' });
      showNotification("Favqulodda so'rov muvaffaqiyatli yuborildi");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, 'emergency_requests');
    }
  };

  const handleFulfilRequest = async (id: string) => {
    try {
        await updateDoc(doc(db, 'emergency_requests', id), { status: 'fulfilled' });
        showNotification("So'rov yakunlandi");
    } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `emergency_requests/${id}`);
    }
  };

  const handleRecordDonation = async () => {
      if (!selectedDonor) return;
      setIsConfirmingDonation(true);

      try {
          const donationData = {
              donorId: selectedDonor.userId,
              donorName: selectedDonor.displayName,
              hospitalId: profile.userId,
              hospitalName: profile.name,
              date: serverTimestamp(),
              bloodGroup: selectedDonor.bloodGroup,
              notes: 'Muntazam qon topshirish'
          };
          
          await addDoc(collection(db, 'donations'), donationData);
          
          // Update donor stats
          const donorDocRef = doc(db, 'users', selectedDonor.userId);
          await updateDoc(donorDocRef, {
              bonusPoints: (selectedDonor.bonusPoints || 0) + 100,
              rating: Math.min(5, (selectedDonor.rating || 4) + 0.1),
              lastDonationDate: serverTimestamp()
          });
          
          showNotification(`Muvaffaqiyatli saqlandi! ${selectedDonor.displayName}ga 100 bonus ball berildi.`);
          setSelectedDonor(null);
      } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'donations / users');
      } finally {
          setIsConfirmingDonation(false);
      }
  };

  const filteredDonors = donors.filter(d => 
    d.bloodGroup.toLowerCase().includes(search血.toLowerCase()) || 
    d.location.toLowerCase().includes(search血.toLowerCase()) ||
    d.displayName.toLowerCase().includes(search血.toLowerCase())
  );

  return (
    <div className="space-y-8 overflow-y-auto h-full pr-2 pb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-4xl font-extrabold text-slate-900 tracking-tighter">{profile.name}</h2>
          <p className="text-slate-500 font-medium tracking-tight">Favqulodda so'rovlar va donorlar boshqaruv paneli.</p>
        </div>
        <Button icon={Plus} onClick={() => setIsModalOpen(true)} className="sm:h-14 sm:px-8">YANGI SO'ROV</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Col: Stats & SOS */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-red-800 font-black text-[10px] uppercase tracking-widest leading-none">Emergency Broadcast</h3>
              <span className="animate-pulse flex h-2 w-2 rounded-full bg-red-600"></span>
            </div>
            <div className="bg-white rounded-xl p-4 border border-red-100 mb-6 shadow-sm">
              <p className="text-xs font-bold text-slate-800 mb-1 italic">Kritik Kamchilik: O- Guruhi</p>
              <p className="text-[11px] text-slate-600 leading-relaxed">Kardiologiya markazi uchun zudlik bilan 4 unit qon zarur.</p>
            </div>
            <Button variant="primary" className="w-full py-4 tracking-widest text-[10px] font-black" onClick={() => setIsModalOpen(true)}>
              142 DONORGA OGOHLANTIRISH
            </Button>
          </div>

          <Card title="SISTEMA STATISTIKASI" icon={Activity}>
             <div className="space-y-6">
                <div>
                  <p className="text-3xl font-black text-slate-800 tracking-tighter">{donors.length}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ro'yxatdan o'tganlar</p>
                </div>
                <div className="h-px bg-slate-100"></div>
                <div>
                  <p className="text-3xl font-black text-slate-800 tracking-tighter">{requests.filter(r => r.status === 'fulfilled').length}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Muvaffaqiyatli topshirilganlar</p>
                </div>
                <div className="h-px bg-slate-100"></div>
                <div>
                  <p className="text-3xl font-black text-blue-600 tracking-tighter">98%</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Javob berish darajasi</p>
                </div>
             </div>
          </Card>
        </div>

        {/* Middle Col: Requests */}
        <div className="lg:col-span-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest italic">Sizning So'rovlaringiz</h3>
            <Badge variant="default">{requests.length} TA SO'ROV</Badge>
          </div>
          <div className="space-y-4">
            {requests.map(req => (
              <Card key={req.id} className={req.status === 'fulfilled' ? 'opacity-60 grayscale-[0.5]' : 'shadow-md border-slate-200'} noPadding>
                <div className="p-6 flex items-start justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <span className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg border ${req.status === 'fulfilled' ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-red-50 text-red-600 border-red-100 shadow-sm'}`}>
                            {req.bloodGroup}
                        </span>
                        <div>
                           <Badge variant={req.status === 'fulfilled' ? 'success' : (req.urgency === 'high' ? 'urgent' : 'warning')}>
                                {req.status === 'fulfilled' ? 'Yakunlandi' : req.urgency}
                           </Badge>
                           <p className="text-[11px] text-slate-400 font-bold mt-1 uppercase tracking-tight">
                              {req.createdAt instanceof Timestamp ? req.createdAt.toDate().toLocaleString('uz-UZ', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) : 'Hozir'}
                           </p>
                        </div>
                    </div>
                    <p className="text-sm text-slate-700 font-medium leading-relaxed">{req.description}</p>
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <div className="text-right">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ehtiyoj</p>
                       <p className="text-2xl font-black text-slate-800 tracking-tighter leading-none">{req.unitsNeeded} UNIT</p>
                    </div>
                    {req.status === 'pending' && (
                        <Button variant="outline" className="text-[9px] px-3 py-1.5" onClick={() => handleFulfilRequest(req.id)}>
                            YAKUNLASH
                        </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
            {requests.length === 0 && (
                <div className="text-center py-20 bg-white border-2 border-dashed border-slate-200 rounded-3xl">
                    <Bell className="mx-auto text-slate-300 mb-4" size={40} />
                    <h4 className="font-bold text-slate-800 mb-1">Faol so'rovlar yo'q</h4>
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-black">Zaxira barqaror holatda</p>
                </div>
            )}
          </div>
        </div>

        {/* Right Col: Donor DB */}
        <div className="lg:col-span-3 space-y-6">
          <div className="space-y-4">
             <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest italic">Donorlar Bazasi</h3>
             <div className="relative group">
                <input 
                  type="text" 
                  placeholder="Qidiruv..." 
                  className="w-full px-5 py-4 rounded-xl border border-slate-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all pl-12 text-sm font-medium"
                  value={search血}
                  onChange={(e) => setSearch血(e.target.value)}
                />
                <Activity className="absolute left-4 top-4.5 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={18} />
             </div>
          </div>
          
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex-1 flex flex-col max-h-[600px]">
            <div className="bg-slate-50 border-b border-slate-100 px-5 py-3 grid grid-cols-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">
               <span className="col-span-2">Donor</span>
               <span className="text-center">Guruh</span>
               <span className="text-right">Action</span>
            </div>
            <div className="divide-y divide-slate-100 overflow-y-auto">
              {filteredDonors.map(donor => (
                <div 
                  key={donor.userId} 
                  className="px-5 py-4 grid grid-cols-4 items-center hover:bg-slate-50 transition-all cursor-pointer group"
                  onClick={() => setSelectedDonor(donor)}
                >
                  <div className="col-span-2 space-y-0.5 min-w-0">
                    <h5 className="text-xs font-bold text-slate-800 truncate">{donor.displayName}</h5>
                    <p className="text-[10px] text-slate-500 flex items-center gap-1 font-medium truncate">
                        <MapPin size={10} /> {donor.location || 'Markaz'}
                    </p>
                  </div>
                  <div className="flex justify-center">
                    <span className="px-2 py-1 bg-red-100 text-red-700 text-[11px] font-black rounded border border-red-200 leading-none">
                        {donor.bloodGroup}
                    </span>
                  </div>
                  <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" className="p-1 rounded-md text-blue-600 hover:bg-blue-50">
                         <Activity size={14} />
                      </Button>
                  </div>
                </div>
              ))}
            </div>
            {filteredDonors.length === 0 && (
                <div className="p-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest italic leading-relaxed">
                   Hech kim topilmadi
                </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal for Recording Donation */}
      <AnimatePresence>
        {selectedDonor && (
           <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-10 text-center space-y-8 relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-24 bg-red-600 opacity-[0.03]"></div>
                <div className="w-24 h-24 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto text-4xl font-black shadow-lg shadow-red-100 border-2 border-white relative z-10">
                    {selectedDonor.bloodGroup}
                </div>
                <div className="space-y-2">
                    <h3 className="text-2xl font-black text-slate-900 tracking-tighter">{selectedDonor.displayName}</h3>
                    <p className="text-sm font-medium text-slate-500 uppercase tracking-widest">Donatsiyani Tasdiqlash</p>
                    <p className="text-xs text-slate-400 leading-relaxed px-4">Donatsiya muvaffaqiyatli amalga oshirilsa, donorga 100 bonus ball taqdim etiladi.</p>
                </div>
                <div className="flex flex-col gap-3 pt-4">
                    <Button onClick={handleRecordDonation} icon={CheckCircle2} className="h-14 text-sm" variant="primary" disabled={isConfirmingDonation}>
                        {isConfirmingDonation ? 'SAQLANMOQDA...' : 'TASDIQLASH VA SAQLASH'}
                    </Button>
                    <Button onClick={() => setSelectedDonor(null)} variant="ghost" className="text-xs" disabled={isConfirmingDonation}>BEKOR QILISH</Button>
                </div>
            </motion.div>
           </div>
        )}
      </AnimatePresence>

      {/* Modal for New Request */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[2rem] shadow-2xl max-w-md w-full overflow-hidden border border-slate-100"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="space-y-1">
                   <h3 className="text-2xl font-black text-slate-800 tracking-tighter">Yangi So'rov</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Favqulodda vaziyat protokoli</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
                  <LogOut size={16} />
                </button>
              </div>
              <form onSubmit={handleCreateRequest} className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Qon Guruhi</label>
                        <select 
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-red-100 outline-none transition-all"
                            value={newRequest.bloodGroup}
                            onChange={(e) => setNewRequest({...newRequest, bloodGroup: e.target.value})}
                        >
                            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Unitlar</label>
                        <input 
                            type="number" 
                            min="1"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-red-100 outline-none transition-all"
                            value={newRequest.unitsNeeded}
                            onChange={(e) => setNewRequest({...newRequest, unitsNeeded: parseInt(e.target.value)})}
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Shoshilinchlik Darajasi</label>
                    <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                        {['low', 'medium', 'high'].map(lvl => (
                            <button 
                                key={lvl}
                                type="button"
                                onClick={() => setNewRequest({...newRequest, urgency: lvl as any})}
                                className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${newRequest.urgency === lvl ? 'bg-white text-red-600 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                {lvl === 'low' ? 'Past' : lvl === 'medium' ? "O'rtacha" : 'Yuqori'}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vaziyat Tavsifi</label>
                    <textarea 
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 h-28 text-sm font-medium text-slate-800 focus:ring-2 focus:ring-red-100 outline-none transition-all resize-none"
                        placeholder="Vaziyat haqida batafsil ma'lumot qoldiring..."
                        value={newRequest.description}
                        onChange={(e) => setNewRequest({...newRequest, description: e.target.value})}
                    />
                </div>
                <Button className="w-full h-14" variant="primary">SO'ROVNI YUBORISH</Button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
