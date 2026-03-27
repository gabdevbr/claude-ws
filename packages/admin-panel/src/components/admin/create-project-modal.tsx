"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";

interface CreateProjectModalProps {
  onProjectCreated?: () => void;
}

export function CreateProjectModal({ onProjectCreated }: CreateProjectModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    idle_timeout: '24',
    memory_limit: '2G',
    cpu_limit: '1.0',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/admin/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          config: {
            idle_timeout_seconds: parseInt(formData.idle_timeout) * 3600,
            memory_limit: formData.memory_limit,
            cpu_limit: formData.cpu_limit,
          },
        }),
      });

      if (response.ok) {
        await response.json();
        setOpen(false);
        setFormData({ name: '', description: '', idle_timeout: '24', memory_limit: '2G', cpu_limit: '1.0' });
        onProjectCreated?.();
      } else {
        const error = await response.json();
        alert(`Failed to create project: ${error.error}`);
      }
    } catch (error) {
      alert(`Failed to create project: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white shadow-lg">
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="backdrop-blur-xl bg-white/90 border border-white/20 shadow-xl sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-600">
            Create New Project
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <Label htmlFor="name">Project Name</Label>
            <Input
              id="name"
              required
              placeholder="My Awesome Project"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="backdrop-blur-sm bg-white/50 border-white/30"
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="What is this project about?"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="backdrop-blur-sm bg-white/50 border-white/30"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="idle_timeout">Auto-stop (hours)</Label>
              <Input
                id="idle_timeout"
                type="number"
                min="1"
                max="168"
                value={formData.idle_timeout}
                onChange={(e) => setFormData({ ...formData, idle_timeout: e.target.value })}
                className="backdrop-blur-sm bg-white/50 border-white/30"
              />
            </div>

            <div>
              <Label htmlFor="memory_limit">Memory</Label>
              <select
                id="memory_limit"
                value={formData.memory_limit}
                onChange={(e) => setFormData({ ...formData, memory_limit: e.target.value })}
                className="w-full px-3 py-2 backdrop-blur-sm bg-white/50 border-white/30 rounded-md"
              >
                <option value="1G">1GB</option>
                <option value="2G">2GB</option>
                <option value="4G">4GB</option>
                <option value="8G">8GB</option>
              </select>
            </div>

            <div>
              <Label htmlFor="cpu_limit">CPU</Label>
              <select
                id="cpu_limit"
                value={formData.cpu_limit}
                onChange={(e) => setFormData({ ...formData, cpu_limit: e.target.value })}
                className="w-full px-3 py-2 backdrop-blur-sm bg-white/50 border-white/30 rounded-md"
              >
                <option value="0.5">0.5 Core</option>
                <option value="1.0">1.0 Core</option>
                <option value="2.0">2.0 Cores</option>
                <option value="4.0">4.0 Cores</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="backdrop-blur-sm bg-white/50 border-white/30"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white shadow-lg"
            >
              {loading ? 'Creating...' : 'Create Project'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
