import { describe, expect, it } from "vitest";
import { parseCoordinate } from "../widgets/shared.js";

describe("parseCoordinate", () => {
  describe("十进制（向后兼容）", () => {
    it("解析正十进制", () => {
      expect(parseCoordinate("31.2304")).toBeCloseTo(31.2304);
    });
    it("解析负十进制", () => {
      expect(parseCoordinate("-121.4737")).toBeCloseTo(-121.4737);
    });
    it("解析整数", () => {
      expect(parseCoordinate("0")).toBe(0);
      expect(parseCoordinate("45")).toBe(45);
    });
    it("忽略前后空白", () => {
      expect(parseCoordinate("  31.2304  ")).toBeCloseTo(31.2304);
    });
  });

  describe("度分秒 (DMS)", () => {
    it("度分秒带方向 N", () => {
      expect(parseCoordinate("31°13'48\"N")).toBeCloseTo(31.23);
    });
    it("度分秒带方向 S 应取负", () => {
      expect(parseCoordinate("31°13'48\"S")).toBeCloseTo(-31.23);
    });
    it("度分秒带方向 E", () => {
      expect(parseCoordinate("121°28'25\"E")).toBeCloseTo(121 + 28 / 60 + 25 / 3600);
    });
    it("度分秒带方向 W 应取负", () => {
      expect(parseCoordinate("121°28'25\"W")).toBeCloseTo(-(121 + 28 / 60 + 25 / 3600));
    });
    it("仅度分", () => {
      expect(parseCoordinate("31°13'N")).toBeCloseTo(31 + 13 / 60);
    });
    it("负号度分秒（不用方向字母）", () => {
      expect(parseCoordinate("-31°13'48\"")).toBeCloseTo(-31.23);
    });
    it("字母标记 d/m/s", () => {
      expect(parseCoordinate("31d13m48sN")).toBeCloseTo(31.23);
    });
    it("空格分隔", () => {
      expect(parseCoordinate("31 13 48 N")).toBeCloseTo(31.23);
    });
    it("大写方向字母", () => {
      expect(parseCoordinate("31°13'48\"n")).toBeCloseTo(31.23);
      expect(parseCoordinate("31°13'48\"s")).toBeCloseTo(-31.23);
    });
  });

  describe("边界与异常", () => {
    it("零点", () => {
      expect(parseCoordinate("0°0'0\"")).toBe(0);
      expect(parseCoordinate("0.0")).toBe(0);
    });
    it("空串返回 null", () => {
      expect(parseCoordinate("")).toBeNull();
      expect(parseCoordinate("   ")).toBeNull();
    });
    it("无效字符串返回 null", () => {
      expect(parseCoordinate("abc")).toBeNull();
      expect(parseCoordinate("∞")).toBeNull();
    });
    it("分或秒超出范围返回 null", () => {
      expect(parseCoordinate("31°60'N")).toBeNull();
      expect(parseCoordinate("31°13'60\"N")).toBeNull();
    });
    it("NaN 输入返回 null", () => {
      expect(parseCoordinate("NaN")).toBeNull();
    });
  });

  describe("歧义处理：裸 s 作为 South 而非秒", () => {
    it("度分 + 裸 s 视为 South", () => {
      // 秒必须有数字前缀，所以 "13's" 中的 s 不能是秒标记 → 落入半球组
      expect(parseCoordinate("31°13's")).toBeCloseTo(-(31 + 13 / 60));
    });
    it("度分秒 + s 作为秒标记", () => {
      // 秒部分有数字 48，s 被秒组消费 → 无半球 → 正值
      expect(parseCoordinate("31°13'48s")).toBeCloseTo(31.23);
    });
  });
});
