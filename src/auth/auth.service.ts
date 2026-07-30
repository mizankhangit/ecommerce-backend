import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import type { StringValue } from 'ms';
import { RegisterDto } from './dto/register.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async register(dto: RegisterDto, res: Response) {
    const user = await this.usersService.create(dto);
    const tokens = await this.generateTokens(user, res);

    const { password, ...userWithoutPassword } = user;
    return {
      user: userWithoutPassword,
      access_token: tokens.accessToken,
    };
  }

  async login(email: string, password: string, res: Response) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account deactivated');
    }

    const tokens = await this.generateTokens(user, res);
    const { password: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      access_token: tokens.accessToken,
    };
  }

  async refresh(refreshToken: string, res: Response) {
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token');
    }

    const redisKey = `refresh:${refreshToken}`;
    const tokenData = await this.redis.get(redisKey);

    if (!tokenData) {
      res.clearCookie('refresh_token', { path: '/auth/refresh' });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const { userId, family } = JSON.parse(tokenData);

    // Token reuse detection: if this token was already used, kill the whole family
    const isUsed = await this.redis.get(`refresh_used:${refreshToken}`);
    if (isUsed) {
      await this.revokeFamily(family);
      res.clearCookie('refresh_token', { path: '/auth/refresh' });
      throw new ForbiddenException('Token reuse detected. Please login again.');
    }

    // Mark old token as used (but keep it briefly for detection)
    await this.redis.setex(`refresh_used:${refreshToken}`, 86400, '1');

    // Delete old token
    await this.redis.del(redisKey);

    // Generate new pair
    const user = await this.usersService.findById(userId);
    const tokens = await this.generateTokens(user, res, family);

    const { password, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      access_token: tokens.accessToken,
    };
  }

  async logout(refreshToken: string, res: Response) {
    if (refreshToken) {
      const redisKey = `refresh:${refreshToken}`;
      const data = await this.redis.get(redisKey);
      if (data) {
        const { family } = JSON.parse(data);
        await this.revokeFamily(family);
      }
      await this.redis.del(redisKey);
    }

    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: '/auth/refresh',
    });

    return { message: 'Logged out successfully' };
  }

  private async generateTokens(
    user: User,
    res: Response,
    existingFamily?: string,
  ) {
    const family = existingFamily || randomBytes(16).toString('hex');

    // 1. Access Token (short-lived)
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get<string>(
          'JWT_ACCESS_EXPIRATION',
          '15m',
        ) as StringValue,
      },
    );

    // 2. Refresh Token (random string, long-lived)
    const refreshToken = randomBytes(40).toString('hex');
    const refreshTtl = this.parseDuration(
      this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d'),
    );

    // 3. Save in Redis with TTL
    await this.redis.setex(
      `refresh:${refreshToken}`,
      refreshTtl,
      JSON.stringify({ userId: user.id, family }),
    );

    // 4. Set HttpOnly Cookie
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      maxAge: refreshTtl * 1000,
      path: '/auth/refresh',
    });

    return { accessToken };
  }

  private async revokeFamily(family: string) {
    // Find all tokens in this family and delete them
    // In production, you might maintain a family index in Redis
    // For simplicity, we just mark the family as revoked
    await this.redis.setex(`family_revoked:${family}`, 86400 * 7, '1');
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([dhm])$/);
    if (!match) return 7 * 24 * 60 * 60; // default 7 days

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'd':
        return value * 24 * 60 * 60;
      case 'h':
        return value * 60 * 60;
      case 'm':
        return value * 60;
      default:
        return 7 * 24 * 60 * 60;
    }
  }
}
