using System;

namespace UOJS
{
	public class UOJS
	{
		public static readonly string Version = "0.1";
		private static readonly string LogPrefix = "UOJS";
		
		public static void Log (string format, params object[] args)
		{
			Console.WriteLine (string.Format ("{0}: ", LogPrefix) + string.Format (format, args));
		}
	}
}
