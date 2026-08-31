import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { CvController } from './cv.controller';
import { CvScanDto } from './dto/cv-scan.dto';

describe('CvController', () => {
  let controller: CvController;

  beforeEach(() => {
    controller = new CvController();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('forwards a frame and returns only the CV result metadata', async () => {
    const recalibration = {
      recalibrated: true,
      detected_text: 'ROOM101',
      confidence: 0.91,
      matched_node_id: 'N101',
      candidate_count: 1,
    };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(recalibration), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const dto: CvScanDto = {
      session_id: 'phone-session',
      timestamp: 123,
      estimated_position: { x: 1, y: 2, floor: 1 },
      image_payload: 'data:image/jpeg;base64,abc',
    };

    const result = await controller.scan(dto);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'accepted',
        source: 'cv-forwarder',
        recalibration,
      }),
    );
    expect(result).not.toHaveProperty('payload');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const requestBody = JSON.parse(
      fetchMock.mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;
    expect(requestBody).toMatchObject({
      session_id: 'phone-session',
      timestamp: 123,
      image_payload: 'data:image/jpeg;base64,abc',
    });
  });

  it('rejects a request without an image', async () => {
    await expect(controller.scan({})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns bad gateway when the CV service is unavailable', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('connection refused'));

    await expect(
      controller.scan({ image_payload: 'data:image/jpeg;base64,abc' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
