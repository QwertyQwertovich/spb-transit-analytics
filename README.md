<div align="center">

  # 🚍 SPb Transit Analytics
  
  **An interactive, high-performance Data Analytics Dashboard for the Saint Petersburg Public Transit System.**

  [![Live Demo](https://img.shields.io/badge/Live_Demo-Available-success?style=for-the-badge&logo=vercel)](https://spb-transit-speed.alexkharitonov.dev/)
  [![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](#)
  [![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](#)
  [![Data Engineering](https://img.shields.io/badge/Data_Engineering-OLAP-FF6B6B?style=for-the-badge)](#)
</div>

---

## 📖 Overview

**SPb Transit Analytics** is an end-to-end data engineering and visualization project that extracts, cleans, and analyzes raw General Transit Feed Specification (GTFS) data of Saint Petersburg's public transportation network.

Built with a focus on performance and accuracy, the project features a **custom Python data pipeline** that pre-aggregates millions of transit segments into a multi-dimensional OLAP cube. The frontend is a lightweight, responsive **Vanilla JavaScript SPA** (Single Page Application) that queries this static data cube to render instant analytics, interactive charts, and maps.

This project was developed as a technical showcase for data engineering, spatial analysis, and frontend optimization.

---

## ✨ Key Features

- ⚡ **Pre-computed OLAP Cube**: Aggregates over 3.5 million transit segments locally in Python, enabling the frontend to perform complex cross-dimensional filtering (by transport type, district, operator, and network) in milliseconds.
- 🗺️ **Interactive Spatial Mapping**: Renders actual transit routes and operator coverage across Saint Petersburg using `Leaflet.js` and custom `GeoJSON` shapes.
- 📊 **Dynamic Dashboards**: Interactive data visualizations (built with `Chart.js`) illustrating median speeds, IQR spread, route distribution, and operator performance.
- 🧹 **Robust Data Cleaning**: Identifies and removes topological anomalies in GTFS shapes (e.g., erratic terminal jumps) ensuring high-fidelity speed metrics.
- 🚀 **Zero-Backend Architecture**: The entire frontend relies on statically served pre-computed JSON payloads, ensuring maximum scalability and sub-second load times.

---

## 📸 Screenshots

<p align="center">
  <img src="assets/map.png" alt="Map View" width="800">
  <br>
  <em>Interactive spatial mapping of public transit speeds across Saint Petersburg</em>
</p>

<p align="center">
  <img src="assets/districts.png" alt="Districts Analytics" width="800">
  <br>
  <em>Performance analytics and comparisons across various city districts</em>
</p>

<p align="center">
  <img src="assets/routes_table.png" alt="Routes Table" width="800">
  <br>
  <em>Detailed routes table with advanced filtering and pagination</em>
</p>

---

## 🛠️ Technology Stack

### Data Engineering Pipeline
* **Python 3**: Core processing language.
* **Geopandas & Shapely**: For spatial joins, mapping route coordinates to city districts.
* **Pandas**: For heavy DataFrame manipulation, GTFS parsing, and aggregation.
* **Itertools**: For powerset generation used in the OLAP cube building phase.

### Frontend
* **Vanilla JavaScript (ES6)**: No heavy frameworks, ensuring maximum performance.
* **HTML5 / CSS3**: Custom design system featuring CSS variables, responsive grids, and modern UI/UX principles.
* **Chart.js**: For rendering bar charts and box-plot alternatives.
* **Leaflet.js**: For interactive map rendering.

---

## 🏗️ Architecture & Data Flow

1. **Extraction**: Raw `feed.zip` (GTFS) and `spb_districts.geojson` are fetched.
2. **Transformation (`process_gtfs.py`)**: 
   - Parses `shapes.txt`, `trips.txt`, `stop_times.txt`, `routes.txt`, and `agency.txt`.
   - Computes point-to-point distances and scheduled travel times.
   - Cleans anomalous segments (e.g., GPS drift at terminals).
   - Maps geographical points to corresponding city districts.
3. **Aggregation (The OLAP Cube)**: 
   - Generates a multi-dimensional JSON cube grouping data by `district`, `operator_name`, `transport_type`, and `urban` flag.
   - Calculates statistical metrics: `median`, `mean`, `Q25`, `Q75`, `total_km`, and `route_count`.
4. **Serving**: Processed JSON artifacts are deployed statically alongside the frontend. The JS client acts as a lightweight query engine.

---

## 🚀 Local Development

To run the project locally and rebuild the dataset:

### Prerequisites
* Python 3.10+
* A modern web browser

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/QwertyQwertovich/spb-transit-analytics.git
   cd spb-transit-analytics
   ```

2. **Run the Data Pipeline (Optional):**
   *(Note: Pre-processed data is already included in `data/processed/` for convenience)*
   ```bash
   pip install -r requirements.txt
   python process_gtfs.py
   ```

3. **Start the Frontend:**
   ```bash
   python -m http.server 8080
   ```
   Navigate to `http://localhost:8080` in your browser.
