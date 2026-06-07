'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { League, Team, Athlete, Match, Challenge } from '@/types';

const drawerClass = 'border-white/10 bg-[#0B1117]/96 p-0 text-white shadow-2xl backdrop-blur-2xl sm:max-w-lg max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:rounded-b-none';

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

export function AddLeagueModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const addDemoLeague = useAppStore((state) => state.addDemoLeague);
  const [name, setName] = useState('');
  const [sport, setSport] = useState('Football');
  const [city, setCity] = useState('');

  const submit = () => {
    if (!name) { toast.error('League name is required'); return; }
    addDemoLeague({
      id: `league_demo_${Date.now()}`,
      name,
      sport,
      country: 'Uganda',
      city,
      status: 'draft',
      teamsCount: 0,
      athletesCount: 0,
      verified: false,
    } as unknown as League);
    toast.success('Demo league created');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={drawerClass}>
        <ModalBody>
          <DialogHeader className="mb-5">
            <DialogTitle>Add League</DialogTitle>
            <DialogDescription>Create a new demo league in local state.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><FieldLabel>League Name</FieldLabel><DemoInput value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div>
              <FieldLabel>Sport</FieldLabel>
              <DemoSelect value={sport} onChange={(e) => setSport(e.target.value)}>
                <option value="Football">Football</option>
                <option value="Basketball">Basketball</option>
                <option value="Rugby">Rugby</option>
              </DemoSelect>
            </div>
            <div><FieldLabel>City</FieldLabel><DemoInput value={city} onChange={(e) => setCity(e.target.value)} /></div>
            <Button className="w-full" onClick={submit}>Create League</Button>
          </div>
        </ModalBody>
      </DialogContent>
    </Dialog>
  );
}

export function AddTeamModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const addDemoTeam = useAppStore((state) => state.addDemoTeam);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');

  const submit = () => {
    if (!name) { toast.error('Team name is required'); return; }
    addDemoTeam({
      id: `team_demo_${Date.now()}`,
      name,
      sport: 'Football',
      country: 'Uganda',
      city,
      athletesCount: 0,
      verified: false,
    } as unknown as Team);
    toast.success('Demo team created');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={drawerClass}>
        <ModalBody>
          <DialogHeader className="mb-5"><DialogTitle>Add Team</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><FieldLabel>Team Name</FieldLabel><DemoInput value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><FieldLabel>City</FieldLabel><DemoInput value={city} onChange={(e) => setCity(e.target.value)} /></div>
            <Button className="w-full" onClick={submit}>Create Team</Button>
          </div>
        </ModalBody>
      </DialogContent>
    </Dialog>
  );
}

export function AddAthleteModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const addDemoAthlete = useAppStore((state) => state.addDemoAthlete);
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');

  const submit = () => {
    if (!name) { toast.error('Athlete name is required'); return; }
    addDemoAthlete({
      id: `athlete_demo_${Date.now()}`,
      name,
      sport: 'Football',
      country: 'Uganda',
      city: 'Kampala',
      position,
      verified: false,
      supportersCount: 0,
      totalSupport: 0,
    } as unknown as Athlete);
    toast.success('Demo athlete created');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={drawerClass}>
        <ModalBody>
          <DialogHeader className="mb-5"><DialogTitle>Add Athlete</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><FieldLabel>Athlete Name</FieldLabel><DemoInput value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><FieldLabel>Position</FieldLabel><DemoInput value={position} onChange={(e) => setPosition(e.target.value)} /></div>
            <Button className="w-full" onClick={submit}>Create Athlete</Button>
          </div>
        </ModalBody>
      </DialogContent>
    </Dialog>
  );
}

export function CreateFixtureModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const addDemoMatch = useAppStore((state) => state.addDemoMatch);
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');

  const submit = () => {
    if (!home || !away) { toast.error('Teams are required'); return; }
    addDemoMatch({
      id: `match_demo_${Date.now()}`,
      sport: 'Football',
      homeTeamId: `team_${home}`,
      awayTeamId: `team_${away}`,
      teamAId: `team_${home}`,
      teamBId: `team_${away}`,
      date: new Date().toISOString(),
      status: 'Upcoming',
      verificationStatus: 'Pending',
    } as unknown as Match);
    toast.success('Demo fixture created');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={drawerClass}>
        <ModalBody>
          <DialogHeader className="mb-5"><DialogTitle>Create Fixture</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><FieldLabel>Home Team Name</FieldLabel><DemoInput value={home} onChange={(e) => setHome(e.target.value)} /></div>
            <div><FieldLabel>Away Team Name</FieldLabel><DemoInput value={away} onChange={(e) => setAway(e.target.value)} /></div>
            <Button className="w-full" onClick={submit}>Schedule Match</Button>
          </div>
        </ModalBody>
      </DialogContent>
    </Dialog>
  );
}

export function SubmitResultModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const updateDemoMatch = useAppStore((state) => state.updateDemoMatch);
  const [matchId, setMatchId] = useState('');
  const [homeScore, setHomeScore] = useState('0');
  const [awayScore, setAwayScore] = useState('0');

  const submit = () => {
    if (!matchId) { toast.error('Match ID is required'); return; }
    updateDemoMatch(matchId, {
      status: 'Completed',
      verificationStatus: 'Pending',
      teamAScore: parseInt(homeScore),
      teamBScore: parseInt(awayScore),
    });
    toast.success('Demo result submitted');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={drawerClass}>
        <ModalBody>
          <DialogHeader className="mb-5"><DialogTitle>Submit Result</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><FieldLabel>Match ID</FieldLabel><DemoInput value={matchId} onChange={(e) => setMatchId(e.target.value)} placeholder="Type 'match_demo_X'" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><FieldLabel>Home Score</FieldLabel><DemoInput type="number" value={homeScore} onChange={(e) => setHomeScore(e.target.value)} /></div>
              <div><FieldLabel>Away Score</FieldLabel><DemoInput type="number" value={awayScore} onChange={(e) => setAwayScore(e.target.value)} /></div>
            </div>
            <Button className="w-full" onClick={submit}>Submit for Verification</Button>
          </div>
        </ModalBody>
      </DialogContent>
    </Dialog>
  );
}

export function VerifyResultModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const updateDemoMatch = useAppStore((state) => state.updateDemoMatch);
  const [matchId, setMatchId] = useState('');

  const submit = () => {
    if (!matchId) { toast.error('Match ID is required'); return; }
    updateDemoMatch(matchId, {
      verificationStatus: 'Verified',
    });
    toast.success('Match result verified locally');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={drawerClass}>
        <ModalBody>
          <DialogHeader className="mb-5"><DialogTitle>Verify Result</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><FieldLabel>Match ID</FieldLabel><DemoInput value={matchId} onChange={(e) => setMatchId(e.target.value)} /></div>
            <Button className="w-full bg-[var(--goal-emerald)] text-black hover:bg-[var(--goal-emerald-dark)]" onClick={submit}>Approve Verification</Button>
          </div>
        </ModalBody>
      </DialogContent>
    </Dialog>
  );
}

export function CreateChallengeModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const addDemoChallenge = useAppStore((state) => state.addDemoChallenge);
  const [athlete, setAthlete] = useState('');
  const [target, setTarget] = useState('Score 2 Goals');

  const submit = () => {
    if (!athlete) { toast.error('Athlete ID required'); return; }
    addDemoChallenge({
      id: `challenge_demo_${Date.now()}`,
      athleteId: athlete,
      sport: 'Football',
      type: 'Performance',
      targetDescription: target,
      status: 'Active',
      verificationStatus: 'Pending',
    } as unknown as Challenge);
    toast.success('Challenge created');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={drawerClass}>
        <ModalBody>
          <DialogHeader className="mb-5"><DialogTitle>Create Challenge</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><FieldLabel>Athlete ID</FieldLabel><DemoInput value={athlete} onChange={(e) => setAthlete(e.target.value)} /></div>
            <div><FieldLabel>Target</FieldLabel><DemoInput value={target} onChange={(e) => setTarget(e.target.value)} /></div>
            <Button className="w-full" onClick={submit}>Create Challenge</Button>
          </div>
        </ModalBody>
      </DialogContent>
    </Dialog>
  );
}

export function ReviewDisputeDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={drawerClass}>
        <ModalBody>
          <DialogHeader className="mb-5"><DialogTitle>Review Dispute</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-300">Resolve disputes submitted by team admins regarding match scores or verification rules.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => { toast.success('Dispute resolved'); onOpenChange(false); }}>Resolve</Button>
              <Button variant="outline" onClick={() => { toast.info('Requesting more evidence'); onOpenChange(false); }}>Request Evidence</Button>
            </div>
          </div>
        </ModalBody>
      </DialogContent>
    </Dialog>
  );
}

export function ReviewPayoutDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={drawerClass}>
        <ModalBody>
          <DialogHeader className="mb-5"><DialogTitle>Review Payout</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-300">Review supported funds pending release to the verified athlete.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => { toast.success('Payout approved and funds released locally'); onOpenChange(false); }}>Approve Payout</Button>
              <Button variant="outline" onClick={() => { toast.info('Payout held for review'); onOpenChange(false); }}>Hold Payout</Button>
            </div>
          </div>
        </ModalBody>
      </DialogContent>
    </Dialog>
  );
}

export function SponsorReportModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={drawerClass}>
        <ModalBody>
          <DialogHeader className="mb-5"><DialogTitle>Monthly Impact Report</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-300">Generate a comprehensive PDF detailing financial commitment, athlete reach, and community engagement for this month.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => { toast.success('Report downloaded (Demo mode)'); onOpenChange(false); }}>Download PDF</Button>
              <Button variant="outline" onClick={() => { toast.success('Report exported to CSV'); onOpenChange(false); }}>Export Data</Button>
            </div>
          </div>
        </ModalBody>
      </DialogContent>
    </Dialog>
  );
}
