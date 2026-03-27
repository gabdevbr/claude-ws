"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Container, Server, Clock, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { CreateProjectModal } from "@/components/admin/create-project-modal";

interface PoolStatus {
  total: number;
  idle: number;
  allocated: number;
  stopping: number;
}

interface Project {
  id: string;
  name: string;
  description?: string | null;
  containerId?: string;
  container_id?: string;
  containerPort?: number;
  container_port?: number;
  dataPath?: string;
  data_path?: string;
  status: string;
  createdAt?: string;
  created_at?: string;
  lastActivityAt?: string;
  last_activity_at?: string;
}

interface DashboardData {
  pool_status: PoolStatus;
  projects: Project[];
}

export default function AdminDashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/admin/dashboard');
      if (response.ok) {
        const data = await response.json();
        setDashboardData(data);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  const poolStatus = dashboardData?.pool_status || { total: 0, idle: 0, allocated: 0, stopping: 0 };
  const projects = dashboardData?.projects || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8 animate-fadeIn">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Admin Dashboard
            </h1>
            <p className="text-gray-600 mt-2">Docker Pool Management System</p>
          </div>
          <CreateProjectModal onProjectCreated={fetchDashboardData} />
        </div>

        {/* Pool Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="glass-card hover:scale-105 transition-transform duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Containers</CardTitle>
              <Server className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">{poolStatus.total}</div>
              <p className="text-xs text-gray-600 mt-1">Pool capacity</p>
            </CardContent>
          </Card>

          <Card className="glass-card hover:scale-105 transition-transform duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Idle Containers</CardTitle>
              <Activity className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{poolStatus.idle}</div>
              <p className="text-xs text-gray-600 mt-1">Available</p>
            </CardContent>
          </Card>

          <Card className="glass-card hover:scale-105 transition-transform duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Allocated</CardTitle>
              <Container className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{poolStatus.allocated}</div>
              <p className="text-xs text-gray-600 mt-1">In use</p>
            </CardContent>
          </Card>

          <Card className="glass-card hover:scale-105 transition-transform duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Stopping</CardTitle>
              <Clock className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-600">{poolStatus.stopping}</div>
              <p className="text-xs text-gray-600 mt-1">In transition</p>
            </CardContent>
          </Card>
        </div>

        {/* Active Projects */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              Active Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No active projects</p>
            ) : (
              <div className="space-y-4">
                {projects.map((project) => {
                  const containerId = project.container_id || project.containerId || 'N/A';
                  const containerPort = project.container_port ?? project.containerPort ?? 'N/A';
                  const folderPath = project.data_path || project.dataPath || 'N/A';
                  const lastActivity = project.last_activity_at || project.lastActivityAt || '';
                  const accessPath = `/api/gateway/${project.id}`;

                  return (
                    <div
                      key={project.id}
                      className="flex items-center justify-between p-4 bg-white/50 rounded-lg hover:bg-white/70 transition-colors animate-slideIn"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold">
                          {project.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{project.name}</h3>
                          <p className="text-sm text-gray-600">Project ID: {project.id}</p>
                          <p className="text-sm text-gray-600">Container: {containerId}</p>
                          <p className="text-sm text-gray-600">Port: {containerPort}</p>
                          <p className="text-sm text-gray-600">Folder: {folderPath}</p>
                          <p className="text-sm text-gray-600">Gateway: {accessPath}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge
                          variant="outline"
                          className={
                            project.status === 'allocated'
                              ? 'bg-green-100 text-green-800 border-green-300'
                              : 'bg-gray-100 text-gray-800 border-gray-300'
                          }
                        >
                          {project.status}
                        </Badge>
                        <span className="text-sm text-gray-600">{formatLastActivity(lastActivity)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatLastActivity(dateString: string): string {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'N/A';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
