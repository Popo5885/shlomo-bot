'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Plus, Trash2, Search, TrendingUp, Tag, X } from 'lucide-react';

interface Lead {
  id: string;
  phone_number: string;
  display_name?: string;
  tags?: string[];
  detected_intent?: string;
  intent_confidence?: number;
  source_group_jid?: string;
  created_at: string;
}

export default function CRMPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [search, setSearch] = useState('');
  const [newLead, setNewLead] = useState({ phone_number: '', display_name: '', notes: '' });

  useEffect(() => {
    loadLeads();
  }, []);

  async function loadLeads() {
    try {
      const data = await api.get<Lead[]>('/api/client/leads');
      setLeads(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function addLead() {
    try {
      await api.post('/api/client/leads', newLead);
      setNewLead({ phone_number: '', display_name: '', notes: '' });
      setShowAddForm(false);
      loadLeads();
    } catch (err) {
      console.error(err);
    }
  }

  async function deleteLead(id: string) {
    try {
      await api.delete(`/api/client/leads/${id}`);
      setLeads(leads.filter(l => l.id !== id));
    } catch (err) {
      console.error(err);
    }
  }

  const filtered = leads.filter(l =>
    !search || (l.display_name?.includes(search) || l.phone_number.includes(search) || l.detected_intent?.includes(search))
  );

  const highIntent = leads.filter(l => (l.intent_confidence || 0) > 0.7).length;
  const thisWeek = leads.filter(l => new Date(l.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length;
  const fromAI = leads.filter(l => l.detected_intent).length;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-7 h-7 text-emerald-400" />
            לידים ו-CRM
          </h1>
          <p className="text-sm text-gray-400 mt-1">ניהול לידים ומעקב אחר כוונת רכישה</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-emerald-500/20 transition-all"
        >
          <Plus className="w-4 h-4" />
          הוסף ליד
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'סה"כ לידים', value: leads.length, color: 'emerald' },
          { label: 'כוונת רכישה גבוהה', value: highIntent, color: 'amber' },
          { label: 'השבוע', value: thisWeek, color: 'blue' },
          { label: 'ממקורות AI', value: fromAI, color: 'purple' },
        ].map((stat, i) => (
          <div key={i} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
            <span className="text-sm text-gray-400">{stat.label}</span>
            <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="חפש לפי שם, טלפון או כוונה..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pr-10 pl-4 py-3 bg-white/5 backdrop-blur border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-emerald-500/50"
        />
      </div>

      {/* Add Lead Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">ליד חדש</h3>
              <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input
                placeholder="מספר טלפון"
                value={newLead.phone_number}
                onChange={e => setNewLead({ ...newLead, phone_number: e.target.value })}
                className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-emerald-500/50"
              />
              <input
                placeholder="שם מלא (אופציונלי)"
                value={newLead.display_name}
                onChange={e => setNewLead({ ...newLead, display_name: e.target.value })}
                className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-emerald-500/50"
              />
              <input
                placeholder="הערות"
                value={newLead.notes}
                onChange={e => setNewLead({ ...newLead, notes: e.target.value })}
                className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <button
              onClick={addLead}
              className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-medium"
            >
              שמור ליד
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leads Table */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">טוען...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Users className="mx-auto h-12 w-12 text-gray-600 mb-3" />
            <p>אין לידים להצגה</p>
            <p className="text-sm mt-1">לידים חדשים יופיעו כאן כשיזוהו אוטומטית מקבוצות או כשתוסיפו ידנית</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr className="text-right text-sm text-gray-400">
                  <th className="p-4">שם</th>
                  <th className="p-4">טלפון</th>
                  <th className="p-4">כוונה</th>
                  <th className="p-4">ביטחון</th>
                  <th className="p-4">מקור</th>
                  <th className="p-4">תאריך</th>
                  <th className="p-4">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(lead => (
                  <tr key={lead.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-4 text-white">{lead.display_name || '—'}</td>
                    <td className="p-4 text-white font-mono text-sm" dir="ltr">{lead.phone_number}</td>
                    <td className="p-4 text-gray-300">{lead.detected_intent || '—'}</td>
                    <td className="p-4">
                      {lead.intent_confidence ? (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          lead.intent_confidence > 0.7 ? 'bg-emerald-500/20 text-emerald-400' :
                          lead.intent_confidence > 0.4 ? 'bg-amber-500/20 text-amber-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {Math.round(lead.intent_confidence * 100)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className="p-4 text-gray-400 text-sm">{lead.source_group_jid?.split('@')[0] || 'ידני'}</td>
                    <td className="p-4 text-gray-400 text-sm">{new Date(lead.created_at).toLocaleDateString('he-IL')}</td>
                    <td className="p-4">
                      <button onClick={() => deleteLead(lead.id)} className="text-red-400 hover:text-red-300">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
