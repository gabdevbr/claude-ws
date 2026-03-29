/**
 * Butler Scheduler API Routes.
 * GET /api/butler/schedules - List all scheduled tasks
 * POST /api/butler/schedules - Create a new scheduled task
 */
import { NextRequest, NextResponse } from 'next/server';
import { getButlerManager } from '@/lib/butler-manager-singleton';
import type { ButlerActionType } from '@/lib/butler';

// GET /api/butler/schedules - List all scheduled tasks
export async function GET(req: NextRequest) {
  try {
    const butlerManager = getButlerManager();
    if (!butlerManager) {
      return NextResponse.json({ error: 'Butler not initialized' }, { status: 503 });
    }

    const scheduler = butlerManager.getSchedulerService();
    if (!scheduler) {
      return NextResponse.json({ error: 'Scheduler not available' }, { status: 503 });
    }

    const tasks = scheduler.listTasks();
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Failed to list scheduled tasks:', error);
    return NextResponse.json({ error: 'Failed to list scheduled tasks' }, { status: 500 });
  }
}

// POST /api/butler/schedules - Create a new scheduled task
export async function POST(req: NextRequest) {
  try {
    const butlerManager = getButlerManager();
    if (!butlerManager) {
      return NextResponse.json({ error: 'Butler not initialized' }, { status: 503 });
    }

    const scheduler = butlerManager.getSchedulerService();
    if (!scheduler) {
      return NextResponse.json({ error: 'Scheduler not available' }, { status: 503 });
    }

    const body = await req.json();
    const { cronExpression, actionType, actionPayload } = body;

    // Validate required fields
    if (!cronExpression || !actionType || !actionPayload) {
      return NextResponse.json(
        { error: 'Missing required fields: cronExpression, actionType, actionPayload' },
        { status: 400 }
      );
    }

    // Validate actionType
    const validActionTypes: ButlerActionType[] = [
      'create_task',
      'update_task',
      'create_project',
      'send_notification',
      'write_file',
      'create_communication_task',
      'run_script',
    ];

    if (!validActionTypes.includes(actionType as ButlerActionType)) {
      return NextResponse.json(
        { error: `Invalid actionType: ${actionType}. Must be one of: ${validActionTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Create the task
    const task = await scheduler.createTask(cronExpression, actionType as ButlerActionType, actionPayload);

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error('Failed to create scheduled task:', error);
    return NextResponse.json({ error: 'Failed to create scheduled task' }, { status: 500 });
  }
}
