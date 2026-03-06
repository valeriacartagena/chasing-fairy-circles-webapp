import React, { useState } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { Play, BarChart2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL !== undefined
    ? import.meta.env.VITE_API_URL
    : 'http://localhost:8000';

const PolicyComparison = ({ config }) => {
    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const runComparison = async () => {
        setIsLoading(true);
        setError(null);

        const policies = ['random', 'greedy', 'ucb'];
        const currentResults = [];

        try {
            // Run policies sequentially to avoid overwhelming python backend
            for (const policy of policies) {
                const res = await axios.post(`${API_BASE}/simulate`, {
                    region: config.region,
                    policy: policy,
                    budget: config.budget,
                    n_trials: 10, // Hardcoded trials for faster stats comparison
                    exploration_constant: config.exploration_constant
                });

                // Aggregate metrics
                const trials = res.data.trials;
                const avgReward = trials.reduce((sum, t) => sum + t.stats.total_reward, 0) / trials.length;
                const avgDiscoveries = trials.reduce((sum, t) => sum + t.stats.n_discoveries, 0) / trials.length;

                // Calculate Std Dev
                const rewardVariance = trials.reduce((sum, t) => sum + Math.pow(t.stats.total_reward - avgReward, 2), 0) / trials.length;
                const discVariance = trials.reduce((sum, t) => sum + Math.pow(t.stats.n_discoveries - avgDiscoveries, 2), 0) / trials.length;

                const totalDiscoveryRate = trials.reduce((sum, t) => sum + t.stats.discovery_rate, 0) / trials.length;

                currentResults.push({
                    policy,
                    avgReward,
                    stdDevReward: Math.sqrt(rewardVariance),
                    avgDiscoveries,
                    stdDevDiscoveries: Math.sqrt(discVariance),
                    discoveryRate: totalDiscoveryRate
                });
            }

            setResults(currentResults);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-[#1e212b] border border-slate-800 rounded-lg p-6 shadow-xl w-full">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                    <BarChart2 className="text-teal-400" size={20} />
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Policy Comparison View</h3>
                </div>
                <button
                    onClick={runComparison}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/40 rounded-md border border-indigo-500/30 text-sm font-medium transition-colors disabled:opacity-50 min-w-40 justify-center"
                >
                    {isLoading ? (
                        <span className="flex items-center gap-2">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Running 30 Trials...
                        </span>
                    ) : (
                        <>
                            <Play size={16} fill="currentColor" /> Run Bulk Comparison
                        </>
                    )}
                </button>
            </div>

            {error && <div className="text-red-400 text-sm mb-4">Error: {error}</div>}

            {results.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Chart */}
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={results} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                                <XAxis dataKey="policy" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} style={{ textTransform: 'uppercase' }} />
                                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                                <RechartsTooltip
                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f8fafc' }}
                                    itemStyle={{ color: '#00d4aa' }}
                                    cursor={{ fill: '#334155', opacity: 0.2 }}
                                />
                                <Bar dataKey="avgReward" name="Avg Reward" fill="#00d4aa" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Data Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-slate-300">
                            <thead className="text-xs text-slate-400 uppercase bg-[#151821] border-b border-slate-700">
                                <tr>
                                    <th className="px-4 py-3 rounded-tl-lg">Policy</th>
                                    <th className="px-4 py-3">Mean Reward</th>
                                    <th className="px-4 py-3">Discoveries</th>
                                    <th className="px-4 py-3 rounded-tr-lg">Disc. Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((r, i) => (
                                    <tr key={r.policy} className="border-b border-slate-800 bg-[#1e212b]">
                                        <td className="px-4 py-3 font-medium uppercase text-slate-200">{r.policy}</td>
                                        <td className="px-4 py-3 font-mono">
                                            {r.avgReward.toFixed(0)} <span className="text-slate-500 text-xs">±{r.stdDevReward.toFixed(0)}</span>
                                        </td>
                                        <td className="px-4 py-3 font-mono">
                                            {r.avgDiscoveries.toFixed(1)} <span className="text-slate-500 text-xs">±{r.stdDevDiscoveries.toFixed(1)}</span>
                                        </td>
                                        <td className="px-4 py-3 font-mono">
                                            {(r.discoveryRate * 100).toFixed(1)}%
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {results.length === 0 && !isLoading && (
                <div className="h-40 flex items-center justify-center text-slate-500 italic text-sm border border-dashed border-slate-700 rounded-lg">
                    Run the bulk comparison to see 10 trials per policy averaged out.
                </div>
            )}
        </div>
    );
};

export default PolicyComparison;
