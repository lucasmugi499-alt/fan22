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
  if (role === 'sponsor') configRole = 'fan';
  
  const config = ROLE_CONFIGS[configRole] || ROLE_CONFIGS['fan'];
  
  const handleAction = (action: string) => {
    switch (action) {
      // Fan Actions
      case 'Support Athlete': router.push('/athletes'); break;
      case 'Explore Matches': router.push('/matches'); break;
      case 'Open Wallet': router.push('/wallet'); break;
      case 'View Awards': router.push('/awards'); break;
      
      // Athlete Actions
      case 'Upload Highlight': toast.info('Highlight upload modal opened'); break;
      case 'Create Post': toast.info('Create post modal opened'); break;
      case 'View Supporters': router.push('/athlete-dashboard'); break;
      case 'Request Verification': toast.success('Verification request submitted'); break;
      
      // League Admin Actions
      case 'Create Fixture': toast.info('Create fixture modal opened'); break;
      case 'Add Team': toast.info('Add team modal opened'); break;
      case 'Add Athlete': toast.info('Add athlete modal opened'); break;
      case 'Submit Result': toast.info('Submit result modal opened'); break;
      case 'Verify Result': router.push('/league-admin'); break;
      case 'Create Challenge': toast.info('Create challenge modal opened'); break;
      
      // Platform Admin Actions
      case 'Review Reports': router.push('/admin'); break;
      case 'Approve League': toast.info('Approve league workflow opened'); break;
      case 'Moderate Feed': router.push('/feed'); break;
      case 'Review Payouts': toast.info('Payout review opened'); break;
      case 'Review Sponsor Dashboard': router.push('/sponsor-dashboard'); break;

      // Team Admin Actions
      // Team Admin Actions
      case 'Add Athlete': router.push('/team-admin?tab=Roster'); break;
      case 'Update Roster': router.push('/team-admin?tab=Roster'); break;
      case 'Submit Result': router.push('/team-admin?tab=Fixtures'); break;
      case 'Upload Team Update': router.push('/team-admin?tab=AthleteUpdates'); break;
      
      default: toast.info(`Action ${action} triggered`);
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
