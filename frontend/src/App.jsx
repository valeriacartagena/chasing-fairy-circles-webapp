import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import GridMap from './components/GridMap';
import RewardDashboard from './components/RewardDashboard';
import ConfigPanel from './components/ConfigPanel';
import BeliefChart from './components/BeliefChart';
import PCAExplorer from './components/PCAExplorer';
import PolicyComparison from './components/PolicyComparison';
import { StepForward, RotateCcw, Play, Square } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL !== undefined
  ? import.meta.env.VITE_API_URL
  : 'http://localhost:8000';

function App() {
  const [config, setConfig] = useState({
    region: 'Namibia',
    policy: 'ucb',
    budget: 5000,
    exploration_constant: 1.0,
    steps: 10,
    cost_survey: 50,
    cost_drill_success: 200,
    cost_drill_fail: 400,
  });

  const [features, setFeatures] = useState([]);
  const [selectedCellIdx, setSelectedCellIdx] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playRef = useRef(false); // mutable ref so the loop can check a live value

  const [simulationState, setSimulationState] = useState({
    isRunning: false,
    isDone: false,
    error: null,
    budgetRemaining: config.budget,
    discoveries: 0,
    actionsLog: [],
    stepLog: null,
    allBeliefs: [],
    stateToken: null,
    stats: { surveys: 0, drills: 0, ignores: 0, totalReward: 0 }
  });

  const loadFeatures = async (region) => {
    try {
      const res = await axios.get(`${API_BASE}/features`, { params: { region } });
      setFeatures(res.data.cells);
      handleReset();
    } catch (err) {
      console.error('Error loading features:', err);
      setSimulationState(s => ({ ...s, error: 'Failed to load region data. Is the backend running?' }));
    }
  };

  useEffect(() => {
    loadFeatures(config.region);
  }, [config.region]);

  const handleConfigChange = (newConfig) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  };

  // Core step function — returns whether we're done
  const executeStep = async (currentState, currentConfig) => {
    const res = await axios.post(`${API_BASE}/step`, {
      region: currentConfig.region,
      policy: currentConfig.policy,
      budget: currentConfig.budget,
      exploration_constant: currentConfig.exploration_constant,
      state_token: currentState.stateToken,
      cost_survey: currentConfig.cost_survey,
      cost_drill_success: currentConfig.cost_drill_success,
      cost_drill_fail: currentConfig.cost_drill_fail,
    });

    const { data } = res;

    if (data.is_done && !data.action) {
      setSimulationState(s => ({
        ...s, isRunning: false, isDone: true,
        stateToken: data.state_token,
        budgetRemaining: data.budget_remaining
      }));
      return { done: true, newState: null };
    }

    let newState;
    setSimulationState(prev => {
      const newActionsLog = [...prev.actionsLog, data.step_log];
      const surveys = newActionsLog.filter(a => a.action === 'survey').length;
      const drills = newActionsLog.filter(a => a.action === 'drill').length;
      const ignores = newActionsLog.filter(a => a.action === 'ignore').length;
      const totalReward = data.step_log.total_reward;
      newState = {
        ...prev,
        isRunning: false,
        isDone: data.is_done,
        stateToken: data.state_token,
        budgetRemaining: data.budget_remaining,
        discoveries: data.is_discovery ? prev.discoveries + 1 : prev.discoveries,
        actionsLog: newActionsLog,
        stepLog: data.step_log,
        allBeliefs: data.all_beliefs || prev.allBeliefs,
        stats: { surveys, drills, ignores, totalReward }
      };
      return newState;
    });

    return { done: data.is_done, newState };
  };

  const handleStepThrough = async () => {
    setSimulationState(s => {
      if (s.isDone || s.isRunning) return s;
      return { ...s, isRunning: true, error: null };
    });
    try {
      // Read latest state directly via a functional update trick
      await new Promise(resolve => {
        setSimulationState(prev => {
          if (prev.isDone || !prev.isRunning) { resolve(); return prev; }
          executeStep(prev, config).then(resolve).catch(err => {
            setSimulationState(s => ({ ...s, isRunning: false, error: err.message }));
            resolve();
          });
          return prev;
        });
      });
    } catch (err) {
      setSimulationState(s => ({ ...s, isRunning: false, error: err.message }));
    }
  };

  const handlePlay = async () => {
    if (isPlaying) {
      // Stop
      playRef.current = false;
      setIsPlaying(false);
      return;
    }

    playRef.current = true;
    setIsPlaying(true);

    // We need to track state across iterations without stale closures.
    // Use a local mutable snapshot that we update after each step.
    let currentStepState = null;

    // Kick off
    setSimulationState(prev => { currentStepState = prev; return prev; });

    for (let i = 0; i < config.steps; i++) {
      if (!playRef.current) break;

      // Get latest state synchronously via ref trick
      await new Promise(resolve => {
        setSimulationState(prev => { currentStepState = prev; resolve(); return prev; });
      });

      if (currentStepState.isDone || currentStepState.budgetRemaining <= 0) break;

      setSimulationState(s => ({ ...s, isRunning: true, error: null }));
      try {
        const { done } = await executeStep(currentStepState, config);
        if (done) break;
      } catch (err) {
        setSimulationState(s => ({ ...s, isRunning: false, error: err.message }));
        break;
      }

      // Small delay so the UI can animate between steps
      await new Promise(r => setTimeout(r, 150));
    }

    playRef.current = false;
    setIsPlaying(false);
    setSimulationState(s => ({ ...s, isRunning: false }));
  };

  const handleReset = () => {
    playRef.current = false;
    setIsPlaying(false);
    setSimulationState({
      isRunning: false,
      isDone: false,
      error: null,
      budgetRemaining: config.budget,
      discoveries: 0,
      actionsLog: [],
      stepLog: null,
      allBeliefs: [],
      stateToken: null,
      stats: { surveys: 0, drills: 0, ignores: 0, totalReward: 0 }
    });
    setSelectedCellIdx(null);
  };

  return (
    <div className="min-h-screen bg-[#0f1117] text-slate-200 flex flex-col font-sans">
      <header className="border-b border-slate-800 bg-[#151821] p-4 flex justify-between items-center shadow-sm z-10">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span className="text-[#00d4aa]">Chasing</span> Fairy Circles
          </h1>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Geologic Hydrogen Exploration Simulator</p>
        </div>

        <div className="flex gap-3 items-center">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-md text-sm font-medium transition-colors"
          >
            <RotateCcw size={16} /> Reset
          </button>

          <button
            onClick={handleStepThrough}
            disabled={simulationState.isRunning || simulationState.isDone || isPlaying}
            className="flex items-center gap-2 px-4 py-2 bg-[#00d4aa]/10 text-[#00d4aa] hover:bg-[#00d4aa]/25 rounded-md border border-[#00d4aa]/30 text-sm font-medium transition-colors disabled:opacity-40"
          >
            <StepForward size={16} /> Step
          </button>

          <button
            onClick={handlePlay}
            disabled={simulationState.isDone && !isPlaying}
            className={`flex items-center gap-2 px-5 py-2 rounded-md border text-sm font-semibold transition-all ${isPlaying
              ? 'bg-orange-500/20 text-orange-400 border-orange-500/40 hover:bg-orange-500/30'
              : 'bg-[#00d4aa]/20 text-[#00d4aa] border-[#00d4aa]/40 hover:bg-[#00d4aa]/30'
              } disabled:opacity-40`}
          >
            {isPlaying
              ? <><Square size={14} fill="currentColor" /> Stop</>
              : <><Play size={14} fill="currentColor" /> Play {config.steps} steps</>
            }
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-80 border-r border-slate-800 bg-[#151821] flex flex-col overflow-y-auto">
          <ConfigPanel
            config={config}
            onConfigChange={handleConfigChange}
            disabled={simulationState.actionsLog.length > 0 && !simulationState.isDone}
          />
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-y-auto relative p-6">
          {simulationState.error && (
            <div className="absolute top-4 left-4 right-4 bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded z-50">
              Error: {simulationState.error}
            </div>
          )}

          {/* Top Stats Row */}
          <div className="mb-6">
            <RewardDashboard
              budget={config.budget}
              state={simulationState}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
            {/* Main Grid Map */}
            <div className="xl:col-span-2">
              <div className="bg-[#1e212b] border border-slate-800 rounded-lg p-6 shadow-xl w-full h-[600px] flex flex-col">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-4">Exploration Grid</h3>
                <div className="flex-1 w-full relative">
                  <GridMap
                    features={features}
                    beliefs={simulationState.allBeliefs}
                    actionsLog={simulationState.actionsLog}
                  />
                </div>
              </div>
            </div>

            {/* Side Charts */}
            <div className="xl:col-span-1 flex flex-col gap-6 h-[600px]">
              <BeliefChart actionsLog={simulationState.actionsLog} />

              <PCAExplorer
                features={features}
                beliefs={simulationState.allBeliefs}
                selectedCellIdx={selectedCellIdx}
                onCellSelect={(payload) => {
                  if (payload && payload.cell_idx !== undefined) {
                    setSelectedCellIdx(payload.cell_idx);
                  }
                }}
              />
            </div>
          </div>

          {/* Policy Comparison Area */}
          <div className="mb-6">
            <PolicyComparison config={config} />
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
