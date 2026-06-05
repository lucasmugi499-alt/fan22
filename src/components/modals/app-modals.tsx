'use client';

import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Athlete, SportType } from '@/lib/types';
import { mockAthletes, mockChallenges } from '@/lib/mockData';
import { useAuth } from '@/context/AuthProvider';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { createFeedPost, createSupportPledge } from '@/lib/firebase/firestore';
import { formatUGX, getInitials, getSportTheme, trustStatements } from '@/lib/sportThemes';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { SportBadge, TrustNote } from '@/components/ui/product';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { ImageIcon, MessageSquare, Send, ShieldCheck, Upload } from 'lucide-react';

const drawerClass =
  'border-white/10 bg-[#0B1117]/96 p-0 text-white shadow-2xl backdrop-blur-2xl sm:max-w-lg max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:rounded-b-none';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{children}</label>;
}

function DemoInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'h-11 w-full rounded-lg border border-white/10 bg-white/6 px-3 text-sm font-semibold text-white outline-none transition-colors placeholder:text-slate-500 focus:border-[var(--goal-emerald)]/55',
        props.className
      )}
    />
  );
}

function DemoSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'h-11 w-full rounded-lg border border-white/10 bg-white/6 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-[var(--goal-emerald)]/55',
        props.className
      )}
    />
  );
}

function ModalBody({ children }: { children: React.ReactNode }) {
  return <div className="max-h-[82dvh] overflow-y-auto p-4 sm:p-5">{children}</div>;
}

export function SupportModal({
  athlete,
  open,
  onOpenChange,
}: {
  athlete?: Athlete | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [amount, setAmount] = useState(25000);
  const { currentUser } = useAuth();
  const deductWalletBalance = useAppStore((state) => state.deductWalletBalance);
  const addPoints = useAppStore((state) => state.addPoints);
  const selectedAthlete = athlete ?? mockAthletes[0];
  const theme = getSportTheme(selectedAthlete.sport);
  const quickAmounts = [5000, 10000, 25000, 50000, 100000];

  const submit = async () => {
    if (isFirebaseConfigured && !currentUser) {
      toast.error('Please log in to support an athlete.');
      return;
    }

    try {
      if (isFirebaseConfigured && currentUser) {
        await createSupportPledge({
          fanId: currentUser.uid,
          athleteId: selectedAthlete.id,
          amount,
          type: 'direct_support',
          status: 'pending',
        });
      }

      deductWalletBalance(amount);
      addPoints(Math.max(50, Math.round(amount / 100)));
      toast.success('Demo support recorded. Real payments are not enabled yet.');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Support could not be recorded');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={drawerClass}>
        <ModalBody>
          <DialogHeader className="mb-5 pr-8">
            <DialogTitle className="font-heading text-2xl font-black">Support Athlete</DialogTitle>
            <DialogDescription>Demo mode only. Fans support athletes directly.</DialogDescription>
          </DialogHeader>

          <div className={`mb-5 rounded-xl border border-white/10 bg-white/5 p-3 ${theme.edgeClass}`}>
            <div className="flex items-center gap-3">
              <div className="size-14 overflow-hidden rounded-xl border border-white/10 bg-white/8">
                <ImageWithFallback
                  src={selectedAthlete.avatarUrl}
                  alt={selectedAthlete.name}
                  fallbackType="athlete"
                  initials={getInitials(selectedAthlete.name)}
                  sport={selectedAthlete.sport}
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <SportBadge sport={selectedAthlete.sport} />
                <h3 className="mt-2 font-heading text-lg font-black text-white">{selectedAthlete.name}</h3>
                <p className="text-xs text-slate-400">{selectedAthlete.position} - {selectedAthlete.city}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <FieldLabel>Quick Amount</FieldLabel>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {quickAmounts.map((item) => (
                  <button
                    key={item}
                    className={cn(
                      'rounded-lg border px-2 py-2 text-sm font-black transition-colors',
                      amount === item ? 'border-[var(--goal-emerald)] bg-[var(--goal-emerald)]/18 text-[var(--goal-mint)]' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/8'
                    )}
                    onClick={() => setAmount(item)}
                  >
                    {item.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel>Custom Amount (UGX)</FieldLabel>
              <DemoInput type="number" min={1000} value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
            </div>
            <div>
              <FieldLabel>Payment Method</FieldLabel>
              <DemoSelect defaultValue="MTN Mobile Money">
                <option>MTN Mobile Money</option>
                <option>Airtel Money</option>
                <option>Flutterwave</option>
                <option>Paystack</option>
                <option>Card</option>
              </DemoSelect>
            </div>
            <div className="rounded-xl border border-[var(--goal-gold)]/20 bg-[var(--goal-gold)]/8 p-4">
              <p className="text-sm leading-6 text-slate-200">
                Your {formatUGX(amount)} helps with transport, meals, training, and recovery support.
              </p>
            </div>
            <TrustNote compact items={trustStatements.slice(0, 3)} />
            <Button className="w-full" size="lg" onClick={submit}>
              Confirm Support
            </Button>
          </div>
        </ModalBody>
      </DialogContent>
    </Dialog>
  );
}

export function PledgeModal({
  athlete,
  open,
  onOpenChange,
}: {
  athlete?: Athlete | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [amount, setAmount] = useState(10000);
  const { currentUser } = useAuth();
  const selectedAthlete = athlete ?? mockAthletes[0];
  const challenges = useMemo(
    () => mockChallenges.filter((challenge) => challenge.athleteId === selectedAthlete.id && challenge.status === 'Active'),
    [selectedAthlete.id]
  );
  const [challengeId, setChallengeId] = useState(challenges[0]?.id ?? mockChallenges[0].id);
  const selectedChallenge = mockChallenges.find((challenge) => challenge.id === challengeId) ?? mockChallenges[0];
  const addPoints = useAppStore((state) => state.addPoints);

  const submit = async () => {
    if (isFirebaseConfigured && !currentUser) {
      toast.error('Please log in to pledge support.');
      return;
    }

    try {
      if (isFirebaseConfigured && currentUser) {
        await createSupportPledge({
          fanId: currentUser.uid,
          athleteId: selectedAthlete.id,
          challengeId: selectedChallenge.id,
          leagueId: selectedAthlete.leagueId,
          amount,
          type: 'performance_pledge',
          status: 'held',
        });
      }

      addPoints(Math.max(25, Math.round(amount / 200)));
      toast.success('Demo support recorded. Real payments are not enabled yet.');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Pledge could not be recorded');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={drawerClass}>
        <ModalBody>
          <DialogHeader className="mb-5 pr-8">
            <DialogTitle className="font-heading text-2xl font-black">Pledge Performance Reward</DialogTitle>
            <DialogDescription>Funds are released only after verified performance.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <FieldLabel>Challenge</FieldLabel>
              <DemoSelect value={selectedChallenge.id} onChange={(event) => setChallengeId(event.target.value)}>
                {(challenges.length ? challenges : mockChallenges).map((challenge) => (
                  <option key={challenge.id} value={challenge.id}>
                    {challenge.targetDescription}
                  </option>
                ))}
              </DemoSelect>
            </div>
            <div>
              <FieldLabel>Pledge Amount (UGX)</FieldLabel>
              <DemoInput type="number" min={1000} value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-[var(--goal-mint)]">
                <ShieldCheck className="size-5" />
                <span className="text-xs font-black uppercase tracking-[0.16em]">Verified Performance</span>
              </div>
              <p className="text-sm leading-6 text-slate-300">
                The athlete receives the reward only after league admins or officials confirm the achievement.
              </p>
            </div>
            <TrustNote compact items={trustStatements.slice(1, 5)} />
            <Button className="w-full" size="lg" onClick={submit}>
              Confirm Pledge
            </Button>
          </div>
        </ModalBody>
      </DialogContent>
    </Dialog>
  );
}

export function CreatePostModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [sport, setSport] = useState<SportType>('Football');
  const [caption, setCaption] = useState('');
  const { currentUser, role } = useAuth();

  const submit = async () => {
    try {
      if (isFirebaseConfigured && currentUser) {
        await createFeedPost({
          authorId: currentUser.uid,
          authorRole: role ?? 'fan',
          sport,
          type: 'AthleteHighlight',
          caption: caption || 'GoalPlace256 community update',
        });
      }

      setCaption('');
      toast.success('Post created in demo mode.');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Post could not be created');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={drawerClass}>
        <ModalBody>
          <DialogHeader className="mb-5 pr-8">
            <DialogTitle className="font-heading text-2xl font-black">Create Post</DialogTitle>
            <DialogDescription>Share a highlight, verified achievement, or community update.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel>Post Type</FieldLabel>
                <DemoSelect defaultValue="Athlete Highlight">
                  <option>Athlete Highlight</option>
                  <option>Verified Achievement</option>
                  <option>Match Result</option>
                  <option>Support Milestone</option>
                  <option>League Update</option>
                  <option>Sponsor Impact</option>
                  <option>Annual Awards Update</option>
                </DemoSelect>
              </div>
              <div>
                <FieldLabel>Sport</FieldLabel>
                <DemoSelect value={sport} onChange={(event) => setSport(event.target.value as SportType)}>
                  <option>Football</option>
                  <option>Basketball</option>
                  <option>Rugby</option>
                </DemoSelect>
              </div>
            </div>
            <div>
              <FieldLabel>Related Athlete / Team / League</FieldLabel>
              <DemoSelect defaultValue="Brian Okello">
                {mockAthletes.map((athlete) => (
                  <option key={athlete.id}>{athlete.name}</option>
                ))}
              </DemoSelect>
            </div>
            <div>
              <FieldLabel>Caption</FieldLabel>
              <textarea
                className="min-h-32 w-full resize-none rounded-lg border border-white/10 bg-white/6 p-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-[var(--goal-emerald)]/55"
                placeholder="Share the result, highlight, or community moment..."
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
              />
            </div>
            <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-white/16 bg-white/5 p-4 text-center">
              <Upload className="mb-2 size-6 text-[var(--goal-mint)]" />
              <p className="text-sm font-bold text-white">Mock media upload</p>
              <p className="text-xs text-slate-400">Images are represented by sport-specific fallbacks in demo mode.</p>
            </div>
            <Button className="w-full" size="lg" onClick={submit}>
              Submit Post
            </Button>
          </div>
        </ModalBody>
      </DialogContent>
    </Dialog>
  );
}

export function CommentsDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [comment, setComment] = useState('');
  const comments = [
    { name: 'Mariam K.', text: 'Love seeing local athletes get visible support.' },
    { name: 'Coach Ivan', text: 'Verification updates make the whole flow feel trustworthy.' },
    { name: 'Lule S.', text: 'This is the kind of community energy Ugandan sport needs.' },
  ];

  const submit = () => {
    setComment('');
    toast.success('Comment added in demo mode');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={drawerClass}>
        <ModalBody>
          <DialogHeader className="mb-5 pr-8">
            <DialogTitle className="flex items-center gap-2 font-heading text-2xl font-black">
              <MessageSquare className="size-5 text-[var(--goal-mint)]" />
              Comments
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {comments.map((item) => (
              <div key={item.name} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-sm font-black text-white">{item.name}</p>
                <p className="mt-1 text-sm leading-6 text-slate-300">{item.text}</p>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <DemoInput value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment..." />
              <Button size="icon" aria-label="Submit comment" onClick={submit}>
                <Send className="size-4" />
              </Button>
            </div>
          </div>
        </ModalBody>
      </DialogContent>
    </Dialog>
  );
}

export function SponsorInterestModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const submit = () => {
    toast.success('Sponsor interest saved in demo mode');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={drawerClass}>
        <ModalBody>
          <DialogHeader className="mb-5 pr-8">
            <DialogTitle className="font-heading text-2xl font-black">Sponsor Interest</DialogTitle>
            <DialogDescription>Tell the GoalPlace256 team what impact you want to create.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <DemoInput placeholder="Business or organization name" />
            <DemoInput placeholder="Contact email" />
            <DemoSelect defaultValue="League Builder">
              <option>Athlete Supporter</option>
              <option>Team Partner</option>
              <option>League Builder</option>
              <option>Annual Awards Sponsor</option>
              <option>Women & Youth Sport Sponsor</option>
            </DemoSelect>
            <textarea
              className="min-h-28 w-full resize-none rounded-lg border border-white/10 bg-white/6 p-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-[var(--goal-emerald)]/55"
              placeholder="What should your sponsorship help build?"
            />
            <Button className="w-full" size="lg" variant="gold" onClick={submit}>
              Send Interest
            </Button>
          </div>
        </ModalBody>
      </DialogContent>
    </Dialog>
  );
}

export function AddFundsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [amount, setAmount] = useState(50000);

  const submit = () => {
    toast.success(`${formatUGX(amount)} added in demo mode`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={drawerClass}>
        <ModalBody>
          <DialogHeader className="mb-5 pr-8">
            <DialogTitle className="font-heading text-2xl font-black">Add Money</DialogTitle>
            <DialogDescription>Mock wallet top up for the product demo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <FieldLabel>Amount (UGX)</FieldLabel>
              <DemoInput type="number" min={1000} value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
            </div>
            <div>
              <FieldLabel>Payment Method</FieldLabel>
              <DemoSelect defaultValue="MTN Mobile Money">
                <option>MTN Mobile Money</option>
                <option>Airtel Money</option>
                <option>Flutterwave</option>
                <option>Paystack</option>
                <option>Card</option>
              </DemoSelect>
            </div>
            <div className="flex min-h-24 flex-col items-center justify-center rounded-xl border border-white/10 bg-white/5 p-4 text-center">
              <ImageIcon className="mb-2 size-6 text-[var(--goal-gold)]" />
              <p className="text-sm leading-6 text-slate-300">No real payments are processed in this demo.</p>
            </div>
            <Button className="w-full" size="lg" onClick={submit}>
              Confirm Top Up
            </Button>
          </div>
        </ModalBody>
      </DialogContent>
    </Dialog>
  );
}
