/**
 * ==============================================================================
 * MAP COMPONENT
 * Interactive map display using OpenLayers 8.2.0 with robot tracking capabilities
 * ==============================================================================
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import './MapComponent.css';

// OpenLayers 8.2.0 imports
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import { fromLonLat } from 'ol/proj.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import OSM from 'ol/source/OSM.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Style from 'ol/style/Style.js';
import Circle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Text from 'ol/style/Text.js';
import { defaults as defaultControls, Zoom, ZoomSlider } from 'ol/control.js';

/**
 * MapComponent - Displays interactive map with robot markers
 * @param {Object[]} robots - Array of robot objects
 * @param {Object} selectedRobot - Currently selected robot
 * @param {Function} onRobotSelect - Callback when robot is selected
 */
const MapComponent = ({ robots, selectedRobot, onRobotSelect }) => {
  // ===== REACT REFS =====
  const mapRef = useRef();                 // Reference to map DOM element
  const mapInstance = useRef(null);        // OpenLayers map instance
  const vectorSource = useRef(null);       // Vector source for robot markers
  
  // ===== REACT STATE =====
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(null);
  
  // ===== VIEW STATE MANAGEMENT =====
  const isUpdating = useRef(false);          // Flag to prevent view changes during updates
  const viewState = useRef({                 // Track current view state
    center: null,
    zoom: null
  });
  const shouldRestoreView = useRef(false);   // Flag to restore view after updates
  const originalViewState = useRef({         // Store original view state
    center: null,
    zoom: null,
    rotation: null
  });

  // ===== MEMOIZED DATA =====
  /* Transform robots data for OpenLayers features */
  const robotFeatures = useMemo(() => {
    if (!robots.length) return [];
    
    return robots.map(robot => ({
      id: robot.id,
      name: robot.name,
      lat: parseFloat(robot.lat),
      lon: parseFloat(robot.lon),
      status: robot.status,
      updated_at: robot.updated_at
    }));
  }, [robots]);

  // ===== MAP INITIALIZATION =====
  /* Initialize OpenLayers map */
  useEffect(() => {
    if (mapInstance.current || !mapRef.current) return;

    try {
      console.log('Initializing OpenLayers 8.2.0 map...');
      
      // Create vector source with options to prevent auto extent calculation
      vectorSource.current = new VectorSource({
        wrapX: false,
        features: [],
        strategy: () => []  // Disable automatic extent calculation
      });
      
      // Custom controls without attribution
      const controls = defaultControls({
        attribution: false,
        zoom: true,
        rotate: false
      }).extend([
        new Zoom(),
        new ZoomSlider()
      ]);
      
      // Initial map center (Berlin for this example)
      const initialCenter = fromLonLat([13.404954, 52.520008]);
      const initialZoom = 12;
      
      // Create OpenLayers map instance
      mapInstance.current = new Map({
        target: mapRef.current,
        layers: [
          // Base OSM tile layer
          new TileLayer({
            source: new OSM({
              url: 'https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png',
              attributions: ''  // Remove attribution
            }),
            opacity: 0.9
          }),
          // Vector layer for robot markers
          new VectorLayer({
            source: vectorSource.current,
            style: (feature) => {
              const robot = feature.get('robot');
              const isSelected = selectedRobot?.id === robot.id;
              return getRobotStyle(robot, isSelected);
            },
            // Performance optimizations
            updateWhileAnimating: false,
            updateWhileInteracting: false,
            renderBuffer: 0,
            renderMode: 'vector'
          })
        ],
        view: new View({
          center: initialCenter,
          zoom: initialZoom,
          minZoom: 2,
          maxZoom: 18,
          enableRotation: false
        }),
        controls: controls,
        // Performance optimizations
        loadTilesWhileAnimating: false,
        loadTilesWhileInteracting: false
      });

      // Store initial view state
      viewState.current = {
        center: initialCenter,
        zoom: initialZoom
      };

      originalViewState.current = {
        center: [...initialCenter], // Copy the array
        zoom: initialZoom,
        rotation: 0
      };

      // ===== EVENT HANDLERS =====
      
      // Track view changes
      const view = mapInstance.current.getView();
      const handleViewChange = () => {
        if (!isUpdating.current) {
          viewState.current.center = view.getCenter();
          viewState.current.zoom = view.getZoom();
        }
      };
      view.on('change', handleViewChange);

      // Handle click on robot markers
      mapInstance.current.on('click', (event) => {
        const features = mapInstance.current.getFeaturesAtPixel(event.pixel);
        if (features.length > 0) {
          const feature = features[0];
          const robot = feature.get('robot');
          if (robot && onRobotSelect) {
            onRobotSelect(robot);
          }
        }
      });

      // Update cursor on hover
      mapInstance.current.on('pointermove', (event) => {
        const features = mapInstance.current.getFeaturesAtPixel(event.pixel);
        mapInstance.current.getTargetElement().style.cursor = 
          features.length > 0 ? 'pointer' : 'default';
      });

      // Prevent view reset during updates
      mapInstance.current.on('postrender', () => {
        if (shouldRestoreView.current && viewState.current.center && viewState.current.zoom) {
          const currentCenter = view.getCenter();
          const currentZoom = view.getZoom();
          
          // Check if view was changed
          const centerChanged = 
            Math.abs(currentCenter[0] - viewState.current.center[0]) > 0.1 ||
            Math.abs(currentCenter[1] - viewState.current.center[1]) > 0.1;
          const zoomChanged = Math.abs(currentZoom - viewState.current.zoom) > 0.01;
          
          if (centerChanged || zoomChanged) {
            // Force restore view without animation
            view.setCenter(viewState.current.center);
            view.setZoom(viewState.current.zoom);
          }
          shouldRestoreView.current = false;
        }
      });

      setMapReady(true);
      console.log('OpenLayers 8.2.0 map initialized successfully');
      
    } catch (error) {
      console.error('Error initializing map:', error);
      setMapError('Failed to initialize map. Please try again.');
    }

    // ===== CLEANUP FUNCTION =====
    return () => {
      if (mapInstance.current) {
        mapInstance.current.setTarget(null);
        mapInstance.current.dispose();
        mapInstance.current = null;
      }
      if (vectorSource.current) {
        vectorSource.current.clear();
        vectorSource.current = null;
      }
    };
  }, [onRobotSelect, selectedRobot]);

  // ===== ROBOT MARKER UPDATES =====
  /* Update robot markers when robots data changes */
  useEffect(() => {
    if (!mapReady || !vectorSource.current || !mapInstance.current) return;

    // Mark as updating to prevent view changes
    isUpdating.current = true;
    shouldRestoreView.current = true;
    
    try {
      const existingFeatures = vectorSource.current.getFeatures();
      
      // Store current view BEFORE any updates
      const view = mapInstance.current.getView();
      const storedCenter = view.getCenter();
      const storedZoom = view.getZoom();
      const storedRotation = view.getRotation();
      
      // Save exact view state
      originalViewState.current = {
        center: storedCenter ? [...storedCenter] : null,
        zoom: storedZoom,
        rotation: storedRotation
      };
      
      // ===== UPDATE LOGIC =====
      
      // If no robots, clear all features
      if (!robotFeatures.length) {
        vectorSource.current.clear(true); 
      } else {
        // Track which robots we've processed
        const processedRobotIds = new Set();
        
        // Use batch updates for better performance
        const featuresToAdd = [];
        const featuresToRemove = [];
        
        // First pass: identify changes
        robotFeatures.forEach(robot => {
          processedRobotIds.add(robot.id);
          const existingFeature = existingFeatures.find(f => 
            f.get('robot')?.id === robot.id
          );
          
          if (existingFeature) {
            // Only update if position actually changed
            const currentCoords = existingFeature.getGeometry().getCoordinates();
            const newCoords = fromLonLat([robot.lon, robot.lat]);
            
            const isDifferent = 
              Math.abs(currentCoords[0] - newCoords[0]) > 0.00001 ||
              Math.abs(currentCoords[1] - newCoords[1]) > 0.00001;
            
            if (isDifferent) {
              existingFeature.getGeometry().setCoordinates(newCoords);
            }
            existingFeature.set('robot', robot);
          } else {
            // Add new point
            const feature = new Feature({
              geometry: new Point(fromLonLat([robot.lon, robot.lat])),
              robot: robot
            });
            featuresToAdd.push(feature);
          }
        });
        
        // Identify features to remove
        existingFeatures.forEach(feature => {
          const robotId = feature.get('robot')?.id;
          if (!processedRobotIds.has(robotId)) {
            featuresToRemove.push(feature);
          }
        });
        
        // Apply all changes at once
        if (featuresToAdd.length > 0) {
          vectorSource.current.addFeatures(featuresToAdd);
        }
        
        if (featuresToRemove.length > 0) {
          featuresToRemove.forEach(feature => {
            vectorSource.current.removeFeature(feature);
          });
        }
      }

      // ===== VIEW RESTORATION =====
      // Force immediate view restoration after updates
      setTimeout(() => {
        if (mapInstance.current && originalViewState.current.center) {
          const currentView = mapInstance.current.getView();
          const currentCenter = currentView.getCenter();
          const currentZoom = currentView.getZoom();
          
          // Always restore original view
          currentView.setCenter(originalViewState.current.center);
          currentView.setZoom(originalViewState.current.zoom);
          currentView.setRotation(originalViewState.current.rotation);
          
          console.log('View restored after update');
        }
      }, 0);

    } catch (error) {
      console.error('Error updating robot markers:', error);
    } finally {
      // Clear updating flag after ensuring view is restored
      setTimeout(() => {
        isUpdating.current = false;
      }, 100);
    }
  }, [robotFeatures, mapReady]);

  // ===== STYLE FUNCTIONS =====
  /**
   * Get OpenLayers style for robot marker
   * @param {Object} robot - Robot data object
   * @param {boolean} isSelected - Whether robot is selected
   * @returns {Style} OpenLayers style object
   */
  const getRobotStyle = useCallback((robot, isSelected) => {
    if (!robot) return null;
    
    const baseColor = robot.status === 'moving' ? '#f59e0b' : '#10b981';
    const selectedColor = '#2563eb';
    const color = isSelected ? selectedColor : baseColor;
    
    return new Style({
      image: new Circle({
        radius: isSelected ? 12 : 10,
        fill: new Fill({ 
          color: color,
          opacity: isSelected ? 1 : 0.9
        }),
        stroke: new Stroke({
          color: '#ffffff',
          width: isSelected ? 4 : 3,
          opacity: 1
        })
      }),
      text: new Text({
        text: robot.name,
        offsetY: -25,
        font: isSelected ? 'bold 14px Inter, sans-serif' : '12px Inter, sans-serif',
        fill: new Fill({ 
          color: isSelected ? selectedColor : '#1e293b'
        }),
        stroke: new Stroke({
          color: '#ffffff',
          width: 4
        }),
        padding: [4, 8],
        backgroundFill: new Fill({
          color: 'rgba(255, 255, 255, 0.95)'
        }),
        backgroundStroke: new Stroke({
          color: color,
          width: 2
        })
      })
    });
  }, []);

  // ===== MAP ACTION FUNCTIONS =====
  
  /* Fit map view to show all robots */
  const fitToRobots = useCallback(() => {
    if (mapInstance.current && robotFeatures.length > 0 && vectorSource.current) {
      try {
        const extent = vectorSource.current.getExtent();
        if (extent && !isNaN(extent[0])) {
          mapInstance.current.getView().fit(extent, {
            padding: [100, 100, 100, 100],
            maxZoom: 15,
            duration: 1000
          });
        }
      } catch (error) {
        console.error('Error fitting to robots:', error);
      }
    }
  }, [robotFeatures.length]);

  /* Reset map view to default position */
  const resetView = useCallback(() => {
    if (mapInstance.current) {
      mapInstance.current.getView().animate({
        center: fromLonLat([13.404954, 52.520008]),
        zoom: 12,
        duration: 1000
      });
    }
  }, []);

  /* Center map on selected robot */
  const centerOnSelected = useCallback(() => {
    if (mapInstance.current && selectedRobot) {
      mapInstance.current.getView().animate({
        center: fromLonLat([parseFloat(selectedRobot.lon), parseFloat(selectedRobot.lat)]),
        zoom: 15,
        duration: 1000
      });
    }
  }, [selectedRobot]);

  // ===== ERROR STATE =====
  if (mapError) {
    return (
      <div className="map-container">
        <div className="map-error">
          <div className="error-icon">⚠️</div>
          <h3>Map Error</h3>
          <p>{mapError}</p>
          <button 
            onClick={() => window.location.reload()}
            className="retry-button"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ===== RENDER =====
  return (
    <div className="map-container">
      <div ref={mapRef} className="ol-map" />
      
      {/* Map Controls Overlay */}
      <div className="map-controls">
        {/* Legend */}
        <div className="map-legend">
          <div className="legend-item">
            <span className="legend-color idle"></span>
            <span className="legend-label">Idle</span>
          </div>
          <div className="legend-item">
            <span className="legend-color moving"></span>
            <span className="legend-label">Moving</span>
          </div>
          <div className="legend-item">
            <span className="legend-color selected"></span>
            <span className="legend-label">Selected</span>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="map-actions">
          <button 
            onClick={fitToRobots}
            className="map-action-button"
            disabled={robotFeatures.length === 0}
            title="Fit view to all robots"
          >
            Fit to All
          </button>
          <button 
            onClick={resetView}
            className="map-action-button"
            title="Reset to default view"
          >
            Reset View
          </button>
          {selectedRobot && (
            <button 
              onClick={centerOnSelected}
              className="map-action-button"
              title="Center on selected robot"
            >
              Center Selected
            </button>
          )}
        </div>
        
        {/* Statistics */}
        <div className="map-stats">
          <div className="map-stat">
            <span className="stat-label">Robots:</span>
            <span className="stat-value">{robotFeatures.length}</span>
          </div>
          {selectedRobot && (
            <div className="selected-robot-info">
              <span className="info-label">Selected:</span>
              <span className="info-value">{selectedRobot.name}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MapComponent;