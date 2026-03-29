/**
 * Butler Scheduler Individual Task API Routes.
 * PATCH /api/butler/schedules/[id] - Update a scheduled task
 * DELETE /api/butler/schedules/[id] - Delete a scheduled task
 */
import { NextRequest, NextResponse } from 'next/server';
import { getButlerManager } from '@/lib/butler-manager-singleton';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/butler/schedules/[id] - Update a scheduled task
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const butlerManager = getButlerManager();
    if (!butlerManager) {
      return NextResponse.json({ error: 'Butler not initialized' }, { status: 503 });
    }

    const { id } = await context.params;
    const scheduler = butlerManager.getSchedulerService();
    if (!scheduler) {
      return NextResponse.json({ error: 'Scheduler not available' }, { status: 503 });
    }

    const body = await req.json();
    const { cronExpression, actionType, actionPayload, enabled } = body;

    // Build updates object (only include provided fields)
    const updates: any = {};
    if (cronExpression !== undefined) updates.cronExpression = cronExpression;
    if (actionType !== undefined) updates.actionType = actionType;
    if (actionPayload !== undefined) updates.actionPayload = actionPayload;
    if (enabled !== undefined) updates.enabled = enabled;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update. Provide: cronExpression, actionType, actionPayload, or enabled' },
        { status: 400 }
      );
    }

    // Update the task
    const task = await scheduler.updateTask(id, updates);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error('Failed to update scheduled task:', error);
    return NextResponse.json({ error: 'Failed to update scheduled task' }, { status: 500 });
  }
}

// DELETE /api/butler/schedules/[id] - Delete a scheduled task
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const butlerManager = getButlerManager();
    if (!butlerManager) {
      return NextResponse.json({ error: 'Butler not initialized' }, { status: 503 });
    }

    const { id } = await context.params;
    const scheduler = butlerManager.getSchedulerService();
    if (!scheduler) {
      return NextResponse.json({ error: 'Scheduler not available' }, { status: 503 });
    }

    // Delete the task
    const deleted = await scheduler.deleteTask(id);

    if (!deleted) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Failed to delete scheduled task:', error);
    return NextResponse.json({ error: 'Failed to delete scheduled task' }, { status: 500 });
  }
}
