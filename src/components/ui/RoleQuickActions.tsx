'use client';

import React from 'react';
import { useAuth } from '@/context/AuthProvider';
import { ROLE_CONFIGS } from '@/lib/auth/roleConfig';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowRight01Icon } from 'hugeicons-react';
import { useRouter } from 'next/navigation';

export function RoleQuickActions() {
  const { role } = useAuth();
  const router = useRouter();
  
  if (!role) return null;
  
  let configRole = role;
  if (role === 'super_admin') configRole = 'platform_admin';
  if (role === 'sponsor') return null;
  
  const config = ROLE_CONFIGS[configRole] || ROLE_CONFIGS['fan'];
  
  const handleAction = (action: string) => {
    if (action === 'Download Impact Report') {
      router.push('/league-admin?tab=Sponsor%20Report');
      return;
    }

    switch (action) {
      // Fan Actions
      case 'Support Athlete': router.push('/athletes'); break;
      case 'Follow Team': router.push('/teams'); break;
      case 'View Match': router.push('/matches'); break;
      case 'Explore Matches': router.push('/matches'); break;
      case 'Open Wallet': router.push('/wallet'); break;
      case 'View Awards': router.push('/awards'); break;
      
      // Athlete Actions
      case 'Publish Highlight': router.push('/athlete-dashboard?tab=Media'); break;
      case 'Upload Highlight': router.push('/athlete-dashboard?tab=Media'); break;
      case 'View Supporters': router.push('/athlete-dashboard?tab=Supporters'); break;
      case 'Request Verification': router.push('/athlete-dashboard?tab=Profile'); break;
      case 'Request Athlete Verification': router.push(configRole === 'team_admin' ? '/team-admin?tab=Athlete%20Updates' : '/athlete-dashboard?tab=Profile'); break;
      case 'Review Public Profile': router.push('/profile'); break;
      
      // League Admin Actions
      case 'Create Fixture': router.push('/league-admin?tab=Fixtures%20%26%20Results'); break;
      case 'Add Team': router.push('/league-admin?tab=Teams%20%26%20Athletes'); break;
      case 'Add Athlete': router.push('/league-admin?tab=Teams%20%26%20Athletes'); break;
      case 'Submit Result': router.push('/league-admin?tab=Fixtures%20%26%20Results'); break;
      case 'Review Match Queue': router.push('/league-admin?tab=Verification'); break;
      case 'Generate Sponsor Report': router.push('/league-admin?tab=Sponsor%20Report'); break;
      
      // Platform Admin Actions
      case 'Approve League': router.push('/admin?tab=Leagues'); break;
      case 'Review Approvals': router.push('/admin?tab=Leagues'); break;
      case 'Review Escalations': router.push('/admin?tab=Reports'); break;
      case 'Export Platform Report': router.push('/admin?tab=Reports'); break;
      case 'Review Moderation Report': router.push('/admin?tab=Reports'); break;
      case 'Review Verification Evidence': router.push('/admin?tab=Verifications'); break;
      case 'Review Payout Request': router.push('/admin?tab=Support%2FPayout%20Review'); break;
      case 'Manage Sponsor Package': router.push('/admin?tab=Sponsors'); break;

      // Team Admin Actions
      case 'Add Athlete to Roster': router.push('/team-admin?tab=Roster'); break;
      case 'Submit Match Result': router.push('/team-admin?tab=Fixtures%20%26%20Results'); break;
      case 'Publish Team Update': router.push('/team-admin?tab=Athlete%20Updates'); break;
      case 'Update Roster': router.push('/team-admin?tab=Roster'); break;
      case 'Upload Team Update': router.push('/team-admin?tab=Athlete%20Updates'); break;

      default: toast.info(`${action} opened in demo mode.`);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {config.primaryActions.map((action) => (
        <Button 
          key={action} 
          variant="outline" 
          className="flex h-12 justify-between bg-white/5 px-4 font-bold text-white hover:bg-white/10 hover:text-[var(--goal-mint)] sm:h-14"
          onClick={() => handleAction(action)}
        >
          {action}
          <ArrowRight01Icon className="size-4 opacity-50" />
        </Button>
      ))}
    </div>
  );
}
