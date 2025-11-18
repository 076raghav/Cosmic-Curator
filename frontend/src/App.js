import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Search, Loader, CheckCircle, AlertTriangle, MousePointer, Star, Sparkles, Binary } from 'lucide-react';
import './App.css';

function App() {
  const [coords, setCoords] = useState({ ra: 83.82, dec: -5.39, radius: 0.5 });
  const [status, setStatus] = useState({ message: 'Ready to scan.', type: 'idle' });
  const [results, setResults] = useState(null);
  const [tooltip, setTooltip] = useState({ visible: false, content: '', x: 0, y: 0 });
  const [selectedAnomaly, setSelectedAnomaly] = useState(null);
  
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState(null);
  const startPos = useRef(null);

  const canvasRef = useRef(null);

  const handleInputChange = (e) => {
    setCoords({ ...coords, [e.target.name]: parseFloat(e.target.value) });
  };

  const drawSkyMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);
    
    const project = (ra, dec, currentCoords) => {
      const scale = Math.min(width, height) / (currentCoords.radius * 2.2);
      const x = (ra - currentCoords.ra) * scale * -1 + width / 2;
      const y = (dec - currentCoords.dec) * scale * -1 + height / 2;
      return { x, y };
    };
    
    if (results) {
        results.field_stars.forEach(star => {
            const { x, y } = project(star.ra, star.dec, coords);
            const radius = Math.max(0.8, 3.5 - (star.mag / 4));
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.4, 1 - star.mag / 20)})`;
            ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
            ctx.shadowBlur = 4;
            ctx.fill();
        });
        ctx.shadowBlur = 0;

        results.anomalies.forEach(anomaly => {
            const { x, y } = project(anomaly.ra, anomaly.dec, coords);
            const isSelected = selectedAnomaly && selectedAnomaly.id === anomaly.id;
            ctx.strokeStyle = isSelected ? '#ffeb3b' : '#00ffaa';
            ctx.lineWidth = isSelected ? 3 : 2;
            ctx.shadowColor = isSelected ? '#ffeb3b' : '#00ffaa';
            ctx.shadowBlur = 8;
            ctx.strokeRect(x - 6, y - 6, 12, 12);
        });
        ctx.shadowBlur = 0;
    }
    
    if (selectionBox) {
        ctx.strokeStyle = 'rgba(0, 255, 170, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(selectionBox.x, selectionBox.y, selectionBox.width, selectionBox.height);
        ctx.setLineDash([]);
    }

  }, [results, coords, selectionBox, selectedAnomaly]);

  useEffect(() => {
    drawSkyMap();
    window.addEventListener('resize', drawSkyMap);
    return () => window.removeEventListener('resize', drawSkyMap);
  }, [drawSkyMap]);

  const handleScan = async (scanCoords) => {
    setStatus({ message: 'Querying live catalog...', type: 'loading' });
    setResults(null);
    setSelectedAnomaly(null);
    setIsSelecting(false);

    try {
      const response = await axios.post('http://localhost:8000/scan', {
        ra: scanCoords.ra,
        dec: scanCoords.dec,
        radius: scanCoords.radius,
        limit: 10,
      });
      setResults(response.data);
      setStatus({ message: response.data.message, type: 'success' });
    } catch (err) {
      setStatus({ message: 'Failed to fetch data from backend.', type: 'error' });
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    handleScan(coords);
  };
  
  const handleMouseDown = (e) => {
    if (status.type === 'loading' || !isSelecting) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    startPos.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setSelectionBox({ x: startPos.current.x, y: startPos.current.y, width: 0, height: 0 });
  };

  const handleMouseMoveOnCanvas = (e) => {
     if (startPos.current) {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        
        const box = {
          x: Math.min(startPos.current.x, currentX),
          y: Math.min(startPos.current.y, currentY),
          width: Math.abs(currentX - startPos.current.x),
          height: Math.abs(currentY - startPos.current.y)
        };
        setSelectionBox(box);
    } else {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const objectInfo = getObjectAtPos(x, y);
        if (objectInfo) {
          const tooltipX = e.clientX;
          const tooltipY = e.clientY;
          
          const tooltipElem = document.querySelector('.Tooltip');
          let finalX = tooltipX + 15;
          let finalY = tooltipY + 15;

          if(tooltipElem){
            const tooltipWidth = tooltipElem.offsetWidth;
            const tooltipHeight = tooltipElem.offsetHeight;
            if (finalX + tooltipWidth > window.innerWidth) {
              finalX = e.clientX - tooltipWidth - 15;
            }
            if (finalY + tooltipHeight > window.innerHeight) {
              finalY = e.clientY - tooltipHeight - 15;
            }
          }
          
          setTooltip({ visible: true, content: objectInfo, x: finalX, y: finalY });
        } else {
          setTooltip({ visible: false, content: '', x: 0, y: 0 });
        }
    }
  };

  const handleMouseUp = () => {
    if (!startPos.current || !selectionBox) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width, rect.height) / (coords.radius * 2.2);

    const centerX = selectionBox.x + selectionBox.width / 2;
    const centerY = selectionBox.y + selectionBox.height / 2;

    const newRa = coords.ra + ((centerX - rect.width / 2) / scale) * -1;
    const newDec = coords.dec + ((centerY - rect.height / 2) / scale) * -1;
    const newRadius = (Math.max(selectionBox.width, selectionBox.height) / scale) / 2;

    const newCoords = { ra: parseFloat(newRa.toFixed(6)), dec: parseFloat(newDec.toFixed(6)), radius: parseFloat(Math.max(0.1, newRadius).toFixed(4)) };
    setCoords(newCoords);
    handleScan(newCoords);

    startPos.current = null;
    setSelectionBox(null);
  };
  
  const getObjectAtPos = (x, y) => {
    if (!results) return null;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width, rect.height) / (coords.radius * 2.2);
    
    const project = (ra, dec, currentCoords) => {
      const projX = (ra - currentCoords.ra) * scale * -1 + rect.width / 2;
      const projY = (dec - currentCoords.dec) * scale * -1 + rect.height / 2;
      return { x: projX, y: projY };
    };

    for (const anomaly of results.anomalies) {
      const pos = project(anomaly.ra, anomaly.dec, coords);
      if (Math.abs(x - pos.x) < 7 && Math.abs(y - pos.y) < 7) {
        return `ANOMALY\nName: ${anomaly.name}\nScore: ${anomaly.anomaly_score.toFixed(2)}`;
      }
    }

    for (const star of results.field_stars) {
      const pos = project(star.ra, star.dec, coords);
      const radius = Math.max(0.8, 3.5 - (star.mag / 4));
      if (Math.sqrt((x-pos.x)**2 + (y-pos.y)**2) < radius + 3) {
        return `Field Star\nID: ${star.id}\nMag: ${star.mag.toFixed(2)}`;
      }
    }
    return null;
  };

  const getStatusIcon = () => {
    if (status.type === 'loading') return <Loader size={20} className="loader-icon" />;
    if (status.type === 'error') return <AlertTriangle size={20} color="#ff8080" />;
    return <CheckCircle size={20} color="#00ffaa" />;
  };

  const getObjectTypeIcon = (type) => {
    const typeStr = String(type).toLowerCase();
    if (typeStr.includes('star') || typeStr.startsWith('*')) return <Star size={16} className="type-icon" />;
    if (typeStr.includes('galaxy') || typeStr.startsWith('g')) return <Sparkles size={16} className="type-icon" />;
    return <Binary size={16} className="type-icon" />;
  }

  return (
    <div className="AppContainer">
      <aside className="Sidebar">
        <header className="Header">
          <h1 className="Title">Cosmic Curator</h1>
          <p className="Subtitle">AI Anomaly Detection</p>
        </header>
        
        <div className="ControlButtons">
          <button 
            className={`ControlButton ${!isSelecting ? 'active' : ''}`}
            onClick={() => setIsSelecting(false)}
            title="Scan using input fields below"
          >
            <Search size={18} /> Manual Scan
          </button>
          <button 
            className={`ControlButton ${isSelecting ? 'active' : ''}`}
            onClick={() => setIsSelecting(true)}
            title="Click and drag on the map to scan a region"
          >
            <MousePointer size={18} /> Select Region
          </button>
        </div>

        <form className="Form" onSubmit={handleFormSubmit}>
          <div className="InputGroup">
            <label className="Label" htmlFor="ra">Center RA (deg)</label>
            <input className="Input" type="number" name="ra" value={coords.ra} onChange={handleInputChange} step="0.0001" />
          </div>
          <div className="InputGroup">
            <label className="Label" htmlFor="dec">Center DEC (deg)</label>
            <input className="Input" type="number" name="dec" value={coords.dec} onChange={handleInputChange} step="0.0001" />
          </div>
          <div className="InputGroup">
            <label className="Label" htmlFor="radius">Scan Radius (deg)</label>
            <input className="Input" type="number" name="radius" value={coords.radius} onChange={handleInputChange} step="0.1" min="0.1" />
          </div>
          <button className="ScanButton" type="submit" disabled={status.type === 'loading'}>
            {status.type === 'loading' ? 'Scanning...' : 'Scan from Inputs'}
          </button>
        </form>
        <div className="StatusContainer">
          {getStatusIcon()}
          <span>{status.message}</span>
        </div>
        <div className="AnomaliesSection">
          <h3 className="AnomaliesTitle">Anomalies Detected</h3>
          <div className="AnomaliesList">
            {results && results.anomalies.map(a => (
              <div 
                className={`AnomalyItem ${selectedAnomaly && selectedAnomaly.id === a.id ? 'selected' : ''}`} 
                key={a.id}
                onClick={() => setSelectedAnomaly(a)}
              >
                <div className="AnomalyHeader">
                  {getObjectTypeIcon(a.type)}
                  <strong>{a.name !== 'N/A' ? a.name : a.id}</strong>
                </div>
                <p><strong>Score:</strong> <span className="score">{a.anomaly_score.toFixed(2)}</span></p>
                <p className="coords">RA: {a.ra.toFixed(8)}, Dec: {a.dec.toFixed(8)}</p>
                <p className="coords">Type: {a.type}</p>
              </div>
            ))}
            {results && results.anomalies.length === 0 && <p>No anomalies found.</p>}
          </div>
        </div>
      </aside>
      <main className="MainContent">
        <div 
          className={`SkyMapContainer ${isSelecting ? 'selecting' : ''}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMoveOnCanvas}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
              startPos.current = null;
              setSelectionBox(null);
              setTooltip({ visible: false });
          }}
        >
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
          {tooltip.visible && <div className="Tooltip" style={{ left: tooltip.x, top: tooltip.y }} dangerouslySetInnerHTML={{__html: tooltip.content.replace(/\n/g, '<br/>')}}/>}
        </div>
      </main>
    </div>
  );
}

export default App;

