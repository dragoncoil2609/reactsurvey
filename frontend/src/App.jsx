import { useState, useEffect } from 'react';
import axios from 'axios';
import { CheckCircle2, Circle, Trash2, Plus, Loader2 } from 'lucide-react';
import './index.css';

const API_URL = '/api/tasks';

function App() {
  const [tasks, setTasks] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await axios.get(API_URL);
      setTasks(res.data);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const addTask = async (e) => {
    e.preventDefault();
    const title = inputValue.trim();
    if (!title) return;
    
    try {
      setInputValue('');
      await axios.post(API_URL, { title });
      fetchTasks();
    } catch (error) {
      console.error('Error adding task:', error);
    }
  };

  const toggleTask = async (task) => {
    try {
      await axios.put(`${API_URL}/${task.id}`, { 
        title: task.title, 
        completed: !task.completed 
      });
      fetchTasks();
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const deleteTask = async (id) => {
    try {
      await axios.delete(`${API_URL}/${id}`);
      fetchTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  return (
    <div className="app-container">
      <div className="glass-card">
        <h1 className="title">
          <span className="gradient-text">TaskMaster</span>
        </h1>
        
        <form onSubmit={addTask} className="input-group">
          <input
            type="text"
            placeholder="What needs to be done?"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="task-input"
          />
          <button type="submit" className="add-btn" disabled={!inputValue.trim()}>
            <Plus size={24} />
          </button>
        </form>

        <div className="tasks-container">
          {loading ? (
            <div className="loader">
              <Loader2 className="spin" size={32} />
            </div>
          ) : tasks.length === 0 ? (
            <p className="empty-state">No tasks yet. Add one above!</p>
          ) : (
            <ul className="task-list">
              {tasks.map(task => (
                <li key={task.id} className={`task-item ${task.completed ? 'completed' : ''}`}>
                  <button 
                    className="toggle-btn" 
                    onClick={() => toggleTask(task)}
                  >
                    {task.completed ? (
                      <CheckCircle2 className="icon-completed" size={24} />
                    ) : (
                      <Circle className="icon-pending" size={24} />
                    )}
                  </button>
                  <span className="task-title">{task.title}</span>
                  <button 
                    className="delete-btn"
                    onClick={() => deleteTask(task.id)}
                  >
                    <Trash2 size={20} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
