import React, { useState, useEffect } from 'react';
import { SignIn, SignUp, UserButton, useUser, useClerk } from '@clerk/clerk-react';
import App from './App';
import { db, supabase } from './services/supabase';
import Footer from './components/Footer';
import Blogs from './components/pages/Blogs';
import Privacy from './components/pages/Privacy';
import Terms from './components/pages/Terms';
import Features from './components/pages/Features';
import Contact from './components/pages/Contact';
import SubscriptionPolicy from './components/pages/SubscriptionPolicy';
import RefundPolicy from './components/pages/RefundPolicy';
import FAQs from './components/pages/FAQs';

export default function AppWithAuth() {
  const { isSignedIn, user, isLoaded } = useUser();
  const [showSignIn, setShowSignIn] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSubscriptionOverlay, setShowSubscriptionOverlay] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'basic' | 'pro'>('pro');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [designsUsed, setDesignsUsed] = useState(0);
  const [designsLimit, setDesignsLimit] = useState(10);
  const [userPlan, setUserPlan] = useState('free');
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState<string | null>(null);

  useEffect(() => {
    const titles: Record<string, string> = {
      'blogs': 'Blog - DeclutterAI | Design Tips & AI Trends',
      'privacy': 'Privacy Policy - DeclutterAI',
      'terms': 'Terms of Service - DeclutterAI',
      'features': 'AI Interior Design Features - DeclutterAI',
      'contact': 'Contact Support - DeclutterAI',
      'faqs': 'Frequently Asked Questions - DeclutterAI',
      'subscription': 'Subscription Policy - DeclutterAI',
      'refund': 'Refund Policy - DeclutterAI'
    };

    if (activePage && titles[activePage]) {
      document.title = titles[activePage];
    } else {
      document.title = 'DeclutterAI - AI-Powered Interior Design & Virtual Decluttering';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activePage]);

  // Load user data from database
  useEffect(() => {
    if (isSignedIn && user) {
      loadUserData();
    } else {
      setLoading(false);
    }
  }, [isSignedIn, user]);

  const loadUserData = async () => {
    try {
      setLoading(true);
      const data = await db.getOrCreateUser(
        user!.id,
        user!.emailAddresses[0].emailAddress,
        user!.firstName || undefined
      );
      
      setUserData(data);
      setDesignsUsed(data.designs_used);
      setDesignsLimit(data.designs_limit);
      setUserPlan(data.plan);
    } catch (error) {
      console.error('Error loading user data:', error);
      // Fallback to localStorage if database fails
      const userId = user!.id;
      const savedData = localStorage.getItem(`user_${userId}`);
      if (savedData) {
        const data = JSON.parse(savedData);
        setDesignsUsed(data.designsUsed || 0);
        setUserPlan(data.plan || 'free');
        const plan = data.plan || 'free';
        setDesignsLimit(plan === 'pro' ? 130 : plan === 'basic' ? 50 : 10);
      }
    } finally {
      setLoading(false);
    }
  };

  const trackAnalytics = (eventName: string, properties?: Record<string, unknown>) => {
    try {
      const payload = {
        eventName,
        properties: properties || {},
        timestamp: Date.now(),
        path: window.location.pathname
      };
      window.dispatchEvent(new CustomEvent('declutterai_analytics', { detail: payload }));
      const key = `analytics_count_${eventName}`;
      const current = Number(localStorage.getItem(key) || '0');
      localStorage.setItem(key, String(current + 1));
    } catch {
      // ignore
    }
  };

  const openAuthModal = (mode: 'signIn' | 'signUp') => {
    setShowSignIn(mode === 'signIn');
    setShowAuthModal(true);
    trackAnalytics('auth_modal_open', { mode, selectedPlan });
  };

  const closeAuthModal = () => {
    setShowAuthModal(false);
    trackAnalytics('auth_modal_close', { selectedPlan });
  };

  useEffect(() => {
    if (!isSignedIn && isLoaded) {
      trackAnalytics('subscription_page_view');
    }
  }, [isSignedIn, isLoaded]);

  useEffect(() => {
    if (!showAuthModal) return;

    const previousActive = document.activeElement as HTMLElement | null;
    const closeButton = document.getElementById('auth-modal-close') as HTMLButtonElement | null;
    closeButton?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeAuthModal();
        previousActive?.focus();
        return;
      }

      if (e.key !== 'Tab') return;

      const modal = document.getElementById('auth-modal');
      if (!modal) return;
      const focusables = Array.from(
        modal.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
      ).filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));

      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (!active || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previousActive?.focus();
    };
  }, [showAuthModal]);

  const handleUpgrade = async (plan: 'free' | 'basic' | 'pro') => {
    try {
      if (!isSignedIn) {
        setSelectedPlan(plan);
        openAuthModal('signUp');
        return;
      }

      if (user) {
        setLoading(true);
        // Record analytics
        trackAnalytics('upgrade_started', { plan });

        // For now, let's just update the DB directly
        // In a production app, this would be handled by a webhook after payment
        const { error } = await supabase
          .from('users')
          .update({
            plan: plan,
            designs_limit: plan === 'pro' ? 130 : plan === 'basic' ? 50 : 10,
            subscription_status: plan === 'free' ? 'inactive' : 'active',
            subscription_start_date: plan === 'free' ? null : new Date().toISOString()
          })
          .eq('clerk_user_id', user.id);

        if (error) throw error;

        // Update local state
        setUserPlan(plan);
        setDesignsLimit(plan === 'pro' ? 130 : plan === 'basic' ? 50 : 10);
        setShowSubscriptionOverlay(false);
        trackAnalytics('upgrade_success', { plan });
      }
    } catch (error) {
      console.error('Error upgrading plan:', error);
    } finally {
      setLoading(false);
    }
  };

  const upgradeToPro = async () => {
    setShowSubscriptionOverlay(true);
    trackAnalytics('subscription_overlay_open', { from: 'upgrade_button', plan: 'pro' });
  };

  // Increment design count (call this from App when design is generated)
  const incrementDesignUsage = async () => {
    try {
      const newCount = await db.incrementDesignUsage(user!.id);
      setDesignsUsed(newCount);
      return newCount;
    } catch (error) {
      console.error('Error incrementing usage:', error);
      // Fallback to local increment
      const newCount = designsUsed + 1;
      setDesignsUsed(newCount);
      return newCount;
    }
  };

  const handleNavigate = (page: string) => {
    if (page === 'home') {
      setActivePage(null);
    } else {
      setActivePage(page);
    }
  };

  const renderExtraPage = () => {
    switch (activePage) {
      case 'blogs':
        return <Blogs />;
      case 'privacy':
        return <Privacy />;
      case 'terms':
        return <Terms />;
      case 'features':
        return <Features />;
      case 'contact':
        return <Contact />;
      case 'faqs':
        return <FAQs onNavigate={handleNavigate} />;
      case 'subscription':
        return <SubscriptionPolicy />;
      case 'refund':
        return <RefundPolicy />;
      case 'faqs':
        return <FAQs />;
      case 'pricing':
        // If already on landing page, scroll to pricing
        if (!isSignedIn) {
          const pricingSection = document.getElementById('pricing-section');
          pricingSection?.scrollIntoView({ behavior: 'smooth' });
          setActivePage(null);
          return null;
        }
        setShowSubscriptionOverlay(true);
        setActivePage(null);
        return null;
      default:
        return null;
    }
  };

  // Loading state
  if (!isLoaded || loading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-accent-gold border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Not signed in - show landing page
  if (!isSignedIn) {
    const plans = [
      {
        key: 'free' as const,
        name: 'Free (Test)',
        price: '₹0',
        cadence: '/month',
        description: 'Try DeclutterAI and generate a few designs.',
        highlights: ['10 designs/month', 'Basic room analysis', 'Standard AI chat'],
        cta: 'Continue Free'
      },
      {
        key: 'basic' as const,
        name: 'Basic',
        price: '₹1,499',
        cadence: '/month',
        description: 'Perfect for light home updates.',
        highlights: [
          '50 designs/month', 
          'Standard processing speed', 
          'Limited style library',
          'Standard AI chat access'
        ],
        cta: 'Choose Basic'
      },
      {
        key: 'pro' as const,
        name: 'Pro',
        price: '₹3,499',
        cadence: '/month',
        description: 'The ultimate design experience.',
        highlights: [
          '130 designs/month', 
          'Priority processing (5x faster)', 
          'All premium style presets', 
          'Advanced AI Designer chat',
          'Commercial license'
        ],
        cta: 'Choose Pro'
      }
    ];

    const comparison = [
      { label: 'Design generations', free: '10/month', basic: '50/month', pro: '130/month' },
      { label: 'Processing Speed', free: 'Standard', basic: 'Standard', pro: 'Instant/Priority' },
      { label: 'AI Chat Expert', free: 'Basic', basic: 'Standard', pro: 'Advanced Designer' },
      { label: 'Style Library', free: '2 Styles', basic: '6 Styles', pro: 'Unlimited/Premium' },
      { label: 'Commercial use', free: '—', basic: '—', pro: 'Included' },
      { label: 'Early access features', free: '—', basic: '—', pro: 'Included' }
    ];

    const faqs = [
      {
        q: 'Can I start for free without entering payment details?',
        a: 'Yes. The Free plan is available without payment details and lets you try core features.'
      },
      {
        q: 'What happens if I close the login pop-up?',
        a: 'You will stay on the subscription page with all pricing and plan details visible.'
      },
      {
        q: 'Do my designs reset monthly?',
        a: 'Yes. Your monthly design allowance resets at the start of your billing cycle.'
      },
      {
        q: 'Can I upgrade later?',
        a: 'Yes. You can upgrade anytime from your dashboard once you’re signed in.'
      }
    ];

    return (
      <div className="min-h-screen bg-dark-bg text-white selection:bg-accent-gold selection:text-dark-bg overflow-x-hidden flex flex-col">
        <div className="flex-1">
          {activePage ? (
            <div className="max-w-[1400px] mx-auto px-6 py-12 animate-fade-in">
              <nav className="flex justify-between items-center mb-16">
                <button onClick={() => handleNavigate('home')} className="flex items-center gap-3 group">
                  <div className="w-12 h-12 gold-gradient rounded-2xl flex items-center justify-center shadow-lg shadow-accent-gold/20 group-hover:rotate-12 transition-transform duration-300">
                    <span className="text-dark-bg font-bold text-2xl">D</span>
                  </div>
                  <span className="text-3xl font-bold heading tracking-tight text-white">
                    Declutter<span className="gold-text-gradient">AI</span>
                  </span>
                </button>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => openAuthModal('signIn')}
                    className="px-5 py-2.5 rounded-2xl bg-dark-card/60 border border-dark-border text-gray-200 hover:text-white hover:border-accent-teal/40 transition-all text-xs font-bold uppercase tracking-widest"
                  >
                    Sign In
                  </button>
                </div>
              </nav>
              {renderExtraPage()}
            </div>
          ) : (
            <div className="max-w-[1400px] mx-auto px-6 py-12">
              <nav className="flex justify-between items-center mb-16 animate-fade-in">
                <button onClick={() => handleNavigate('home')} className="flex items-center gap-3 group">
                  <div className="w-12 h-12 gold-gradient rounded-2xl flex items-center justify-center shadow-lg shadow-accent-gold/20 group-hover:rotate-12 transition-transform duration-300">
                    <span className="text-dark-bg font-bold text-2xl">D</span>
                  </div>
                  <span className="text-3xl font-bold heading tracking-tight text-white">
                    Declutter<span className="gold-text-gradient">AI</span>
                  </span>
                </button>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => openAuthModal('signIn')}
                    className="px-5 py-2.5 rounded-2xl bg-dark-card/60 border border-dark-border text-gray-200 hover:text-white hover:border-accent-teal/40 transition-all text-xs font-bold uppercase tracking-widest"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => openAuthModal('signUp')}
                    className="px-6 py-3 rounded-2xl gold-gradient text-dark-bg font-bold hover:scale-105 transition-transform shadow-lg shadow-accent-gold/10 text-xs uppercase tracking-widest"
                  >
                    Get Started
                  </button>
                </div>
              </nav>

          <header className="grid grid-cols-1 gap-14 items-start">
            <div className="animate-fade-in">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-white/5 text-accent-teal text-xs font-bold mb-8 uppercase tracking-widest">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-teal opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-teal"></span>
                </span>
                Pricing & plans
              </div>

              <h1 className="text-6xl md:text-7xl font-bold heading leading-[1.05] tracking-tighter mb-6">
                Pick a plan that
                <span className="gold-text-gradient"> transforms</span> your home.
              </h1>
              <p className="text-gray-400 text-lg md:text-xl max-w-2xl leading-relaxed font-medium">
                Get clutter insights, furniture moves, and AI-powered redesigns. Review plans first — login only when you’re ready.
              </p>

              <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Trusted', value: '2,000+ homes' },
                  { label: 'Speed', value: 'Seconds per redesign' },
                  { label: 'Security', value: 'Privacy-first uploads' }
                ].map((t) => (
                  <div key={t.label} className="bg-dark-card/60 border border-dark-border rounded-[1.75rem] p-6">
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-500">{t.label}</p>
                    <p className="mt-2 text-white font-bold text-lg tracking-tight">{t.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-10 flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => openAuthModal('signUp')}
                  className="px-10 py-5 gold-gradient text-dark-bg rounded-[2rem] font-bold text-base md:text-lg hover:scale-105 transition-all shadow-2xl shadow-accent-gold/20 flex items-center gap-3 justify-center"
                >
                  Start with {selectedPlan === 'pro' ? 'Pro' : 'Free'}
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
                <button
                  onClick={() => openAuthModal('signIn')}
                  className="px-10 py-5 bg-dark-card border border-dark-border rounded-[2rem] font-bold text-base md:text-lg text-white hover:border-accent-teal/40 transition-all flex items-center gap-3 justify-center"
                >
                  I already have an account
                </button>
              </div>
            </div>

            <div className="animate-fade-in">
              <div className="mt-10 bg-dark-card rounded-3xl border border-dark-border p-7 flex items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 teal-gradient rounded-2xl flex items-center justify-center shadow-lg shadow-accent-teal/20">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-white tracking-tight">Plan includes</p>
                    <p className="text-sm text-gray-400 font-medium">Cleanup guidance + redesign prompts</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="gold-text-gradient font-bold text-2xl">4.9</p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold">Avg rating</p>
                </div>
              </div>
            </div>
          </header>

          <section id="pricing-section" className="mt-20 animate-fade-in" aria-label="Plans">
            <div className="flex items-end justify-between gap-8 flex-wrap">
              <div>
                <h2 className="heading text-4xl md:text-5xl font-bold tracking-tight">Plans</h2>
                <p className="text-gray-500 mt-3 font-medium">Select a plan to continue. You can close login anytime.</p>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-dark-card border border-dark-border text-gray-300 text-xs font-bold uppercase tracking-widest">
                <span className="w-2 h-2 rounded-full bg-accent-teal animate-pulse"></span>
                Cancel anytime
              </div>
            </div>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-8">
              {plans.map((p) => {
                const selected = selectedPlan === p.key;
                return (
                  <div
                    key={p.key}
                    className={`group rounded-[3rem] border shadow-[0_30px_60px_-15px_rgba(0,0,0,0.6)] overflow-hidden transition-all duration-500 hover:scale-[1.02] ${
                      selected ? 'border-accent-gold/60 ring-1 ring-accent-gold/20' : 'border-dark-border hover:border-accent-gold/40'
                    }`}
                  >
                    <div className="p-10 bg-dark-card relative h-full flex flex-col">
                      {p.key === 'pro' && (
                        <div className="absolute top-8 right-8 px-4 py-2 rounded-full gold-gradient text-dark-bg text-[10px] font-bold uppercase tracking-[0.25em] shadow-lg shadow-accent-gold/10">
                          Most Popular
                        </div>
                      )}
                      <div className="flex flex-col gap-6">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-500">{p.name}</p>
                          <div className="mt-6 flex items-end gap-2">
                            <span className="text-5xl font-bold text-white tracking-tight">{p.price}</span>
                            <span className="text-gray-500 text-sm font-bold mb-2">{p.cadence}</span>
                          </div>
                          <p className="mt-4 text-gray-400 font-medium">{p.description}</p>
                        </div>
                      </div>

                      <div className="mt-8 space-y-4 flex-grow">
                        {p.highlights.map((h) => (
                          <div key={h} className="flex items-center gap-3 bg-dark-bg rounded-2xl border border-dark-border px-5 py-4">
                            <div className="w-9 h-9 rounded-xl teal-gradient flex items-center justify-center text-dark-bg shrink-0">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                            <p className="text-white font-bold text-sm tracking-tight">{h}</p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-10 flex flex-col gap-4">
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            setSelectedPlan(p.key);
                            trackAnalytics('plan_selected', { plan: p.key });
                          }}
                          className={`w-full py-4 rounded-2xl font-bold uppercase tracking-widest text-xs border transition-all ${
                            selected
                              ? 'gold-gradient text-dark-bg border-transparent shadow-lg shadow-accent-gold/10'
                              : 'bg-dark-bg text-white border-dark-border hover:border-accent-gold/40'
                          }`}
                        >
                          {selected ? 'Selected' : 'Select plan'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openAuthModal('signUp')}
                          className="w-full py-4 rounded-2xl font-bold uppercase tracking-widest text-xs bg-dark-bg border border-dark-border text-white hover:border-accent-teal/40 transition-all"
                        >
                          Continue
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mt-16 bg-dark-card rounded-[3rem] border border-dark-border p-10 animate-fade-in" aria-label="Feature comparison">
            <div className="flex items-center justify-between gap-8 flex-wrap">
              <h3 className="heading text-3xl font-bold tracking-tight">Compare features</h3>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-dark-bg border border-dark-border text-gray-300 text-xs font-bold uppercase tracking-widest">
                <span className="w-2 h-2 rounded-full bg-accent-gold animate-pulse"></span>
                Transparent limits
              </div>
            </div>

            <div className="mt-8 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.25em] text-gray-500">
                    <th className="py-4 pr-6">Feature</th>
                    <th className="py-4 pr-6">Free</th>
                    <th className="py-4 pr-6">Basic</th>
                    <th className="py-4">Pro</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row) => (
                    <tr key={row.label} className="border-t border-dark-border">
                      <td className="py-5 pr-6 font-bold text-white">{row.label}</td>
                      <td className="py-5 pr-6 text-gray-400 font-medium">{row.free}</td>
                      <td className="py-5 pr-6 text-gray-400 font-medium">{row.basic}</td>
                      <td className="py-5 text-gray-200 font-medium">{row.pro}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="faq-section" className="mt-16 grid grid-cols-1 lg:grid-cols-2 gap-10 animate-fade-in" aria-label="FAQs">
            <div>
              <h3 className="heading text-3xl font-bold tracking-tight">FAQ</h3>
              <p className="text-gray-500 mt-3 font-medium">Quick answers before you sign in.</p>
              <div className="mt-8 bg-dark-card rounded-[3rem] border border-dark-border p-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 gold-gradient rounded-2xl flex items-center justify-center text-dark-bg shadow-lg shadow-accent-gold/10">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M12 20h.01M12 4a8 8 0 100 16 8 8 0 000-16z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-bold text-lg tracking-tight">No surprises</p>
                    <p className="text-gray-500 font-medium">Close the login pop-up anytime and keep browsing plans.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-dark-card rounded-[3rem] border border-dark-border overflow-hidden">
              <div className="p-8 space-y-3">
                {faqs.map((f, i) => {
                  const open = expandedFaq === i;
                  const buttonId = `faq-button-${i}`;
                  const panelId = `faq-panel-${i}`;
                  return (
                    <div key={f.q} className={`rounded-[2rem] border transition-all ${open ? 'border-accent-teal/40' : 'border-dark-border'}`}>
                      <button
                        id={buttonId}
                        aria-controls={panelId}
                        aria-expanded={open}
                        type="button"
                        onClick={() => {
                          setExpandedFaq(open ? null : i);
                          trackAnalytics('faq_toggle', { index: i, open: !open });
                        }}
                        className="w-full flex items-center justify-between gap-6 px-7 py-6 text-left"
                      >
                        <span className="text-white font-bold tracking-tight">{f.q}</span>
                        <span className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${open ? 'border-accent-teal/50 text-accent-teal' : 'border-dark-border text-gray-500'}`}>
                          <svg className={`w-5 h-5 transition-transform ${open ? 'rotate-45' : 'rotate-0'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 5v14M5 12h14" />
                          </svg>
                        </span>
                      </button>
                      <div
                        id={panelId}
                        role="region"
                        aria-labelledby={buttonId}
                        className={`px-7 pb-6 text-gray-400 font-medium leading-relaxed ${open ? 'block' : 'hidden'}`}
                      >
                        {f.a}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="mt-16 pb-16 animate-fade-in" aria-label="Trust indicators">
            <div className="bg-dark-card rounded-[3rem] border border-dark-border p-10">
              <div className="flex items-start justify-between gap-8 flex-wrap">
                <div>
                  <h3 className="heading text-3xl font-bold tracking-tight">Trusted by builders, renters, and homeowners</h3>
                  <p className="text-gray-500 mt-3 font-medium max-w-2xl">Improve layout, lighting, and organization with actionable steps — then generate a redesign that matches your style.</p>
                </div>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <svg key={s} className="w-5 h-5 text-accent-gold" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                  <span className="text-gray-400 font-bold text-sm ml-3">4.9 average</span>
                </div>
              </div>

              <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
                {['Modern', 'Minimal', 'Boho', 'Industrial'].map((tag) => (
                  <div key={tag} className="bg-dark-bg border border-dark-border rounded-2xl px-6 py-5">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-bold">Style</p>
                    <p className="mt-2 text-white font-bold text-lg tracking-tight">{tag}</p>
                  </div>
                ))}
              </div>

              <div className="mt-10 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 teal-gradient rounded-2xl flex items-center justify-center text-dark-bg shadow-lg shadow-accent-teal/10">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 11c0 1.657-1.343 3-3 3S6 12.657 6 11s1.343-3 3-3 3 1.343 3 3zm0 0c0-1.657 1.343-3 3-3s3 1.343 3 3-1.343 3-3 3-3-1.343-3-3zm-6.5 9h13a3.5 3.5 0 003.5-3.5V9A5.5 5.5 0 0016.5 3h-9A5.5 5.5 0 002 9v7.5A3.5 3.5 0 005.5 20z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-bold tracking-tight">Ready to begin?</p>
                    <p className="text-gray-500 font-medium">Sign in only after you’ve reviewed the plans.</p>
                  </div>
                </div>
                <button
                  onClick={() => openAuthModal('signUp')}
                  className="px-12 py-5 gold-gradient text-dark-bg rounded-[2rem] font-bold text-lg hover:scale-105 transition-all shadow-2xl shadow-accent-gold/20 flex items-center gap-3 justify-center"
                >
                  Continue
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            </div>
          </section>
            </div>
          )}
        </div>
        <Footer onNavigate={handleNavigate} />

        {showAuthModal && (
          <div
            className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-50 flex items-center justify-center p-6 animate-fade-in"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeAuthModal();
            }}
            role="presentation"
          >
            <div
              id="auth-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="auth-modal-title"
              className="bg-dark-card p-10 rounded-[3rem] border border-dark-border max-w-md w-full relative shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8)]"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                id="auth-modal-close"
                onClick={closeAuthModal}
                aria-label="Close login"
                className="absolute top-7 right-7 w-12 h-12 rounded-2xl bg-dark-bg border border-dark-border text-gray-400 hover:text-white hover:border-accent-teal/40 transition-all flex items-center justify-center"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="text-center mb-8">
                <div className="w-16 h-16 gold-gradient rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-accent-gold/20">
                  <span className="text-dark-bg font-bold text-3xl">D</span>
                </div>
                <h2 id="auth-modal-title" className="text-4xl font-bold heading text-white mb-3 tracking-tight">
                  {showSignIn ? 'Welcome Back' : 'Create Account'}
                </h2>
                <p className="text-gray-500 font-medium">
                  Continue with {selectedPlan === 'pro' ? 'Pro' : 'Free'} after signing in.
                </p>
              </div>

              <div className="auth-container">
                {showSignIn ? (
                  <SignIn
                    appearance={{
                      elements: {
                        rootBox: "w-full",
                        card: "bg-transparent shadow-none border-none p-0 w-full",
                        header: "hidden",
                        socialButtonsBlockButton: "bg-dark-muted border border-dark-border text-white hover:bg-zinc-800 transition-all rounded-2xl h-14",
                        socialButtonsBlockButtonText: "font-bold text-sm uppercase tracking-widest",
                        dividerRow: "hidden",
                        formButtonPrimary: "gold-gradient text-dark-bg hover:opacity-90 border-none rounded-2xl h-14 font-bold text-lg shadow-xl shadow-accent-gold/10",
                        footer: "hidden",
                        formFieldLabel: "text-gray-500 font-bold text-[10px] uppercase tracking-[0.2em] mb-2 block",
                        formFieldInput: "bg-dark-muted border-dark-border text-white rounded-2xl h-14 focus:border-accent-gold transition-all outline-none px-6 font-medium",
                        identityPreviewText: "text-white font-medium",
                        identityPreviewEditButtonIcon: "text-accent-gold"
                      }
                    }}
                    signUpUrl="/sign-up"
                  />
                ) : (
                  <SignUp
                    appearance={{
                      elements: {
                        rootBox: "w-full",
                        card: "bg-transparent shadow-none border-none p-0 w-full",
                        header: "hidden",
                        socialButtonsBlockButton: "bg-dark-muted border border-dark-border text-white hover:bg-zinc-800 transition-all rounded-2xl h-14",
                        socialButtonsBlockButtonText: "font-bold text-sm uppercase tracking-widest",
                        dividerRow: "hidden",
                        formButtonPrimary: "gold-gradient text-dark-bg hover:opacity-90 border-none rounded-2xl h-14 font-bold text-lg shadow-xl shadow-accent-gold/10",
                        footer: "hidden",
                        formFieldLabel: "text-gray-500 font-bold text-[10px] uppercase tracking-[0.2em] mb-2 block",
                        formFieldInput: "bg-dark-muted border-dark-border text-white rounded-2xl h-14 focus:border-accent-gold transition-all outline-none px-6 font-medium",
                        identityPreviewText: "text-white font-medium",
                        identityPreviewEditButtonIcon: "text-accent-gold"
                      }
                    }}
                    signInUrl="/sign-in"
                  />
                )}
              </div>

              <div className="mt-8 text-center">
                <button
                  onClick={() => {
                    setShowSignIn(!showSignIn);
                    trackAnalytics('auth_modal_switch', { mode: !showSignIn ? 'signIn' : 'signUp' });
                  }}
                  className="text-gray-500 hover:text-accent-gold text-sm font-bold uppercase tracking-widest transition-colors"
                >
                  {showSignIn ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Signed in - show main app
  return (
    <div className="min-h-screen flex flex-col bg-dark-bg text-white">
      {/* Main Content Area */}
      <div className="relative flex-1">
        {activePage ? (
          <div className="animate-fade-in">
            <nav className="flex justify-between items-center px-8 py-6 border-b border-dark-border bg-dark-bg/80 backdrop-blur-xl sticky top-0 z-50">
              <button onClick={() => handleNavigate('home')} className="flex items-center gap-3 group">
                <div className="w-10 h-10 gold-gradient rounded-xl flex items-center justify-center shadow-lg shadow-accent-gold/20 group-hover:rotate-12 transition-transform overflow-hidden p-1.5">
                  <img 
                    src="/declutter.png" 
                    alt="DeclutterAI Logo" 
                    className="w-full h-full object-contain brightness-0"
                  />
                </div>
                <span className="text-2xl font-bold heading tracking-tight text-white">DeclutterAI</span>
              </button>
              <UserButton afterSignOutUrl="/" />
            </nav>
            {renderExtraPage()}
          </div>
        ) : designsUsed < designsLimit ? (
          <App 
            onDesignGenerated={incrementDesignUsage}
            designsUsed={designsUsed}
            designsLimit={designsLimit}
            userPlan={userPlan}
            userName={user?.firstName || 'User'}
            upgradeToPro={upgradeToPro}
            userButton={
              <UserButton 
                appearance={{
                  elements: {
                    userButtonAvatarBox: "w-10 h-10 border-2 border-dark-border",
                    userButtonPopoverCard: "bg-dark-card border border-dark-border text-white shadow-2xl",
                    userButtonPopoverActionButton: "text-white hover:bg-gray-800 transition-colors",
                    userButtonPopoverActionButtonText: "text-white font-bold",
                    userButtonPopoverActionButtonIcon: "text-white",
                    userButtonPopoverFooter: "hidden",
                    userButtonPopoverHeaderTitle: "text-white font-bold",
                    userButtonPopoverHeaderSubtitle: "text-gray-400 font-medium",
                    userButtonPopoverMain: "bg-dark-card",
                    userPreviewMainIdentifier: "text-white font-bold",
                    userPreviewSecondaryIdentifier: "text-gray-400 font-medium",
                  }
                }}
                afterSignOutUrl="/" 
              />
            }
          />
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 animate-fade-in">
            <div className="relative mb-12">
              <div className="absolute -inset-8 gold-gradient opacity-20 blur-3xl rounded-full"></div>
              <div className="relative w-32 h-32 bg-dark-card rounded-[2.5rem] border border-dark-border flex items-center justify-center shadow-2xl">
                <svg className="w-16 h-16 text-accent-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>
            
            <div className="text-center max-w-xl">
              <h2 className="text-5xl font-bold heading text-white mb-6">
                Limit Reached
              </h2>
              <p className="text-gray-400 text-xl mb-12 leading-relaxed">
                {userPlan === 'free' 
                  ? "You've unlocked all your free transformations. Upgrade to a premium plan to continue reimagining your home with up to 130 designs per month."
                  : `You've reached your monthly limit of ${designsLimit} designs. Your account will reset at the start of your next billing cycle.`}
              </p>
              
              {userPlan !== 'pro' && (
                <button
                  onClick={upgradeToPro}
                  className="px-12 py-5 gold-gradient text-dark-bg rounded-[2rem] font-bold text-xl hover:scale-105 transition-all shadow-2xl shadow-accent-gold/20 flex items-center gap-3 mx-auto"
                >
                  {userPlan === 'free' ? 'Unlock Premium' : 'Upgrade to Pro'}
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showSubscriptionOverlay && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[200] overflow-y-auto"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setShowSubscriptionOverlay(false);
              trackAnalytics('subscription_overlay_close');
            }
          }}
        >
          <div className="max-w-[1400px] mx-auto px-6 py-12">
            <div className="flex items-center justify-between mb-8">
              <h2 className="heading text-4xl font-bold tracking-tight">Subscription Plans</h2>
              <button
                onClick={() => {
                  setShowSubscriptionOverlay(false);
                  trackAnalytics('subscription_overlay_close');
                }}
                className="w-12 h-12 rounded-2xl bg-dark-card border border-dark-border text-gray-400 hover:text-white hover:border-accent-teal/40 transition-all flex items-center justify-center"
                aria-label="Close subscription"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  key: 'free' as const,
                  name: 'Free (Prest)',
                  price: '₹0',
                  cadence: '/month',
                  description: 'Try DeclutterAI and generate a few designs.',
                  highlights: ['10 designs/month', 'Room cleanup insights', 'Basic redesign prompts'],
                },
                {
                  key: 'basic' as const,
                  name: 'Basic',
                  price: '₹1,499',
                  cadence: '/month',
                  description: 'Great for occasional home transformations.',
                  highlights: ['50 designs/month', 'Faster iterations', 'Standard style presets'],
                },
                {
                  key: 'pro' as const,
                  name: 'Pro',
                  price: '₹3,499',
                  cadence: '/month',
                  description: 'Unlimited creativity for serious home transformation.',
                  highlights: ['130 designs/month', 'Priority generation', 'Premium style presets', 'Commercial use'],
                }
              ].map((p) => (
                <div key={p.key} className="group rounded-[3rem] border border-dark-border bg-dark-card p-10 transition-all duration-500 hover:scale-[1.02] hover:border-accent-gold/40 flex flex-col">
                  <div className="flex flex-col gap-6">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-500">{p.name}</p>
                      <div className="mt-6 flex items-end gap-2">
                        <span className="text-5xl font-bold text-white tracking-tight">{p.price}</span>
                        <span className="text-gray-500 text-sm font-bold mb-2">{p.cadence}</span>
                      </div>
                      <p className="mt-4 text-gray-400 font-medium">{p.description}</p>
                    </div>
                  </div>
                  <div className="mt-8 space-y-4 flex-grow">
                    {p.highlights.map((h) => (
                      <div key={h} className="flex items-center gap-3 bg-dark-bg rounded-2xl border border-dark-border px-5 py-4">
                        <div className="w-9 h-9 rounded-xl teal-gradient flex items-center justify-center text-dark-bg shrink-0">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <p className="text-white font-bold text-sm tracking-tight">{h}</p>
                      </div>
                    ))}
                  </div>
                  {userPlan !== p.key && (
                    <button
                      onClick={() => handleUpgrade(p.key)}
                      className={`mt-10 w-full py-4 rounded-2xl font-bold uppercase tracking-widest text-xs border transition-all ${
                        p.key === 'pro' || p.key === 'basic'
                          ? 'gold-gradient text-dark-bg border-transparent'
                          : 'bg-dark-bg text-white border-dark-border hover:border-accent-gold/40'
                      }`}
                    >
                      {p.key === 'free' ? 'Downgrade' : 'Upgrade Now'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <Footer onNavigate={handleNavigate} />
    </div>
  );
}
