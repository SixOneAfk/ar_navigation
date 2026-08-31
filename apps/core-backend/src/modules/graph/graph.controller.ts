import { Body, Controller, Post } from '@nestjs/common';
import { GraphService } from './graph.service';

type RouteRequestDto = {
  startNode: string;
  targetNode: string;
};

@Controller('api/v1')
export class GraphController {
  constructor(private readonly graphService: GraphService) {
    console.log('[CORE-BACKEND:GraphController] Initialized with GraphService');
  }

  @Post('route')
  async computeRoute(@Body() payload: RouteRequestDto) {
    console.log('[CORE-BACKEND:GraphController] POST /api/v1/route called with:', {
      startNode: payload?.startNode,
      targetNode: payload?.targetNode,
    });

    if (!payload?.startNode || !payload?.targetNode) {
      throw new Error('startNode and targetNode are required');
    }

    return this.graphService.computeRoute(payload.startNode, payload.targetNode);
  }
}