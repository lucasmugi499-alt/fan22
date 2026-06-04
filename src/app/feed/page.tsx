'use client';

import React, { useState } from 'react';
import { FeedCard } from '@/components/ui/feed-card';
import { mockFeed } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { Plus, X, Image as ImageIcon } from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';

const filters = ['All', 'Football', 'Basketball', 'Rugby', 'Highlight', 'VerifiedAchievement', 'MatchResult', 'SupportMilestone', 'LeagueUpdate'];

export default function FeedPage() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const filteredFeed = mockFeed.filter(post => {
    if (activeFilter === 'All') return true;
    if (['Football', 'Basketball', 'Rugby'].includes(activeFilter)) return post.sport === activeFilter;
    return post.type === activeFilter;
  });

  return (
    <div className="container max-w-2xl mx-auto px-4 py-8 relative min-h-screen">
      <div className="mb-8 text-center pt-8">
        <h1 className="text-4xl font-black mb-3 text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200">The Social Heartbeat</h1>
        <p className="text-muted-foreground text-lg">Follow the moments, milestones, and athletes shaping grassroots sport.</p>
      </div>

      <ScrollArea className="w-full whitespace-nowrap mb-8 pb-4">
        <div className="flex w-max space-x-2 px-1">
          {filters.map(filter => (
            <Button
              key={filter}
              variant={activeFilter === filter ? 'default' : 'outline'}
              className={`rounded-full transition-all ${
                activeFilter === filter 
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]' 
                  : 'bg-white/5 border-white/10 hover:bg-white/10 text-muted-foreground hover:text-white'
              }`}
              onClick={() => setActiveFilter(filter)}
            >
              {filter.replace(/([A-Z])/g, ' $1').trim()}
            </Button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="invisible" />
      </ScrollArea>

      <div className="space-y-6 pb-24">
        <AnimatePresence>
          {filteredFeed.map(post => (
            <motion.div 
              key={post.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <FeedCard post={post} />
            </motion.div>
          ))}
        </AnimatePresence>
        
        {filteredFeed.length === 0 && (
          <div className="text-center text-muted-foreground py-16 bg-white/5 rounded-3xl border border-white/5">
            <p className="text-lg">No posts found for this filter.</p>
            <Button variant="link" className="text-emerald-400 mt-2" onClick={() => setActiveFilter('All')}>Clear filter</Button>
          </div>
        )}
      </div>

      {/* Floating Create Post Button */}
      <motion.div 
        className="fixed bottom-24 right-6 md:bottom-12 md:right-12 z-40"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Button 
          size="icon" 
          className="w-16 h-16 rounded-full bg-emerald-600 text-white shadow-[0_0_30px_rgba(16,185,129,0.5)] hover:bg-emerald-500 hover:shadow-[0_0_40px_rgba(16,185,129,0.7)] transition-all border border-emerald-400/30"
          onClick={() => setIsCreateModalOpen(true)}
        >
          <Plus className="w-8 h-8" />
        </Button>
      </motion.div>

      {/* Create Post Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setIsCreateModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-zinc-950 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h2 className="text-xl font-bold">Create Post</h2>
                <Button variant="ghost" size="icon" onClick={() => setIsCreateModalOpen(false)} className="rounded-full">
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <div className="p-4">
                <textarea 
                  className="w-full min-h-[150px] bg-transparent border-none resize-none focus:ring-0 text-lg placeholder:text-muted-foreground/60"
                  placeholder="Share an update, milestone, or highlight..."
                  autoFocus
                />
                <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="rounded-full bg-white/5 border-white/10 text-emerald-400">
                      <ImageIcon className="w-4 h-4 mr-2" /> Media
                    </Button>
                    <select className="bg-white/5 border border-white/10 rounded-full text-xs px-3 py-1 text-muted-foreground outline-none">
                      <option>Highlight</option>
                      <option>Milestone</option>
                      <option>Update</option>
                    </select>
                  </div>
                  <Button className="bg-emerald-600 hover:bg-emerald-500 font-bold px-6 rounded-full" onClick={() => setIsCreateModalOpen(false)}>
                    Post
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
