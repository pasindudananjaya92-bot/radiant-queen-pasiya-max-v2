import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  CheckCircle2,
  Plus,
  Bell,
  Sparkles,
  ChevronRight,
  Coffee,
  Flame,
  X,
} from 'lucide-react';
import { ClubEventItem, UserProfile } from '../types.ts';

interface EventsViewProps {
  currentUser: UserProfile | null;
  onNotify?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const EventsView: React.FC<EventsViewProps> = ({ currentUser, onNotify }) => {
  const [events, setEvents] = useState<ClubEventItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // New event form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('07:00 AM');
  const [distanceKm, setDistanceKm] = useState('10');
  const [paceCategory, setPaceCategory] = useState('All Paces (4:30 - 6:30 min/km)');

  const fetchEvents = async () => {
    try {
      setIsLoading(true);
      const url = currentUser ? `/api/events?userUid=${encodeURIComponent(currentUser.uid)}` : '/api/events';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      console.error('Error loading events:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [currentUser]);

  const handleToggleRsvp = async (eventId: number) => {
    if (!currentUser) {
      onNotify?.('Please sign in to RSVP for club events', 'error');
      return;
    }

    try {
      const res = await fetch(`/api/events/${eventId}/rsvp`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        onNotify?.(
          data.rsvp
            ? "RSVP Confirmed! You'll receive an automated reminder on Saturday at 7:00 PM."
            : 'RSVP Cancelled.',
          'success'
        );
        fetchEvents();
      }
    } catch (err: any) {
      onNotify?.(err.message || 'Failed to update RSVP', 'error');
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onNotify?.('Please sign in to schedule club events', 'error');
      return;
    }

    if (!title || !description || !location || !eventDate || !eventTime) {
      onNotify?.('Please fill in all required event fields', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          location,
          eventDate,
          eventTime,
          distanceKm: parseFloat(distanceKm) || 10,
          paceCategory,
        }),
      });

      if (res.ok) {
        onNotify?.('Club Event scheduled! Auto-reminder agent configured.', 'success');
        setIsModalOpen(false);
        // Reset form
        setTitle('');
        setDescription('');
        setLocation('');
        setEventDate('');
        fetchEvents();
      } else {
        const err = await res.json();
        onNotify?.(err.error || 'Failed to schedule event', 'error');
      }
    } catch (err: any) {
      onNotify?.(err.message || 'Error creating event', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/40 border border-slate-800 p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <Sparkles className="w-3.5 h-3.5" />
                Autonomous Event Sync Active
              </span>
              <span className="text-xs text-slate-400 font-mono">
                System 3 • Sat 7:00 PM Auto Reminders
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-100 tracking-tight flex items-center gap-3">
              <Calendar className="w-8 h-8 text-amber-400" />
              <span>Club Events & Group Runs</span>
            </h1>
            <p className="mt-2 text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed">
              Join weekly Sunday 7:00 AM long runs and speed workouts. When you RSVP, Pasiya Agent automatically delivers a weather and gear briefing directly to your dashboard on Saturday at 7:00 PM.
            </p>
          </div>

          <button
            id="create-event-btn"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold shadow-lg shadow-amber-950 transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            Host Club Event
          </button>
        </div>
      </div>

      {/* Events Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            Upcoming Club Runs & Meetups
          </h2>
          <span className="text-xs text-slate-400">
            {events.length} Scheduled Sessions
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {events.map((event) => (
            <div
              key={event.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-700 transition-all shadow-xl group"
            >
              <div>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <span className="inline-block text-xs font-mono px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold mb-2">
                      {new Date(event.eventDate).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                      })} • {event.eventTime}
                    </span>
                    <h3 className="text-xl font-bold text-slate-100 group-hover:text-amber-400 transition-colors">
                      {event.title}
                    </h3>
                  </div>

                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-800 text-slate-300 shrink-0">
                    {event.distanceKm} km
                  </span>
                </div>

                <p className="text-sm text-slate-300 leading-relaxed mb-4">
                  {event.description}
                </p>

                <div className="space-y-2 text-xs text-slate-400 pt-3 border-t border-slate-800/80">
                  <div className="flex items-center gap-2 text-slate-300">
                    <MapPin className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{event.location}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <Flame className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Pace Bracket: <strong className="text-slate-300">{event.paceCategory}</strong></span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <Users className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span><strong className="text-indigo-300 font-mono">{event.rsvpsCount}</strong> Athletes Attending</span>
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="mt-6 pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <Bell className="w-3.5 h-3.5" />
                  <span>Sat 7:00 PM Auto Reminder</span>
                </div>

                <button
                  id={`rsvp-btn-${event.id}`}
                  onClick={() => handleToggleRsvp(event.id)}
                  className={`inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                    event.isRsvpCurrentUser
                      ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/30'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {event.isRsvpCurrentUser ? 'RSVP Confirmed (Tap to Leave)' : 'RSVP for Group Run'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Host Event Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-400" />
                Schedule Club Group Run
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Event Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sunday Sunrise 10K Long Run & Coffee"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Description & Route Details *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe the route, hydration stops, paced subgroups, and post-run gathering spot..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Meeting Location & Landmark *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Marina Promenade (Near Main Clubhouse Fountain)"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Event Date (YYYY-MM-DD) *</label>
                  <input
                    type="date"
                    required
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Start Time *</label>
                  <input
                    type="text"
                    required
                    placeholder="07:00 AM"
                    value={eventTime}
                    onChange={(e) => setEventTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Distance (km)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={distanceKm}
                    onChange={(e) => setDistanceKm(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Pace Category</label>
                  <input
                    type="text"
                    value={paceCategory}
                    onChange={(e) => setPaceCategory(e.target.value)}
                    placeholder="All Paces (4:30 - 6:30 min/km)"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs">
                ⚡ <strong>Autonomous Agent Dispatch:</strong> When scheduled, Pasiya Agent will monitor RSVPs and send Saturday 7:00 PM reminder notifications to all confirmed athletes.
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
                >
                  {isSubmitting ? 'Scheduling...' : 'Publish Event'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}; 
